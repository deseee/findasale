/**
 * Unified Print Kit Page
 *
 * Combines yard sign QR (1 per sale, 8.5x11 format) and item price tags
 * (grid of 6 per page, 3.5"x2" business card size) into a single printable kit.
 *
 * Features:
 * - Fetch sale details and items for the organizer
 * - Render yard sign with QR code linking to sale page
 * - Render item tags grid with QR codes linking to individual items
 * - Filter items: AVAILABLE and RESERVED only (exclude SOLD)
 * - Print CSS for B&W optimized output, page breaks between sections
 * - Free QR code generation via qrserver API (no library install)
 */

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import { useOrganizerTier } from '../../../hooks/useOrganizerTier';
import Head from 'next/head';
import Link from 'next/link';

interface Sale {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  startDate: string;
  endDate: string;
  saleType?: string;
  photoUrls?: string[];
}

interface Item {
  id: string;
  title: string;
  price: number | null;
  condition: string | null;
  status: string;
  photoUrl?: string;
  saleId: string;
}

interface PrintKitPageProps {}

const ConditionBadge: React.FC<{ condition: string }> = ({ condition }) => {
  const conditionMap: Record<string, { bg: string; text: string; label: string }> = {
    S: { bg: '#10b981', text: '#ffffff', label: 'Mint' },
    A: { bg: '#3b82f6', text: '#ffffff', label: 'Excellent' },
    B: { bg: '#f59e0b', text: '#ffffff', label: 'Good' },
    C: { bg: '#ef4444', text: '#ffffff', label: 'Fair' },
    D: { bg: '#6b7280', text: '#ffffff', label: 'Poor' },
  };

  const info = conditionMap[condition];
  if (!info) return null;

  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: info.bg,
        color: info.text,
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 'bold',
      }}
    >
      {condition} · {info.label}
    </span>
  );
};

const PrintKitPage: React.FC<PrintKitPageProps> = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { isPro } = useOrganizerTier();
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch sale details
  const { data: sale, isLoading: saleLoading, error: saleError } = useQuery<Sale>({
    queryKey: ['print-kit-sale', saleId],
    queryFn: async () => {
      const response = await api.get(`/sales/${saleId}`);
      return response.data as Sale;
    },
    enabled: !!saleId && typeof saleId === 'string',
  });

  // Fetch items for the sale
  const { data: items, isLoading: itemsLoading, error: itemsError } = useQuery<Item[]>({
    queryKey: ['print-kit-items', saleId],
    queryFn: async () => {
      const response = await api.get('/items/drafts', { params: { saleId } });
      return response.data as Item[];
    },
    enabled: !!saleId && typeof saleId === 'string',
  });

  // Fetch treasure hunt clues — endpoint is public, no isPro gate needed here
  const { data: clues } = useQuery<Array<{id: string; category: string | null; createdAt: string}>>({
    queryKey: ['print-kit-clues', saleId],
    queryFn: async () => {
      const response = await api.get(`/sales/${saleId}/treasure-hunt-qr`);
      return response.data.clues ?? [];
    },
    enabled: !!saleId && typeof saleId === 'string',
  });

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    router.push('/organizer/dashboard');
  };

  const printQRPage = (url: string, label: string, sublabel: string) => {
    const qrSrc = getQRUrl(url, 600);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${label}</title>
      <style>
        @page { margin: 0.3in; }
        body { margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; min-height: 100vh; font-family: sans-serif; background: white; box-sizing: border-box; }
        img { width: min(92vw, 80vh); height: min(92vw, 80vh); display: block; flex-shrink: 0; }
        .label { font-size: clamp(22px, 3.5vw, 40px); font-weight: 800; margin-top: 12px; text-align: center; line-height: 1.2; }
        .sublabel { font-size: clamp(13px, 1.8vw, 20px); color: #333; margin-top: 8px; text-align: center; max-width: 580px; line-height: 1.4; }
        .footer { font-size: 13px; color: #999; margin-top: 10px; text-align: center; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <img src="${qrSrc}" alt="${label}" />
      <div class="label">${label}</div>
      <div class="sublabel">${sublabel}</div>
      <div class="footer">finda.sale</div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 600);
  };

  // Download file with auth token
  const downloadAuthenticatedFile = async (url: string, filename: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      showToast('Failed to download file. Please try again.', 'error');
      console.error('Download error:', error);
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (typeof saleId !== 'string') {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const isLoading = saleLoading || itemsLoading;

  // Filter items: only AVAILABLE and RESERVED
  const filteredItems = (items || []).filter(
    (item) => item.status === 'AVAILABLE' || item.status === 'RESERVED'
  );

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Format sale type for display
  const formatSaleType = (type?: string) => {
    if (!type) return '';
    return type
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Generate QR code URL
  const getQRUrl = (data: string, size: number = 150) => {
    const encoded = encodeURIComponent(data);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
  };

  // Chunk items into groups of 15 for pagination (3×5 grid, fills full page)
  const itemPages = [];
  for (let i = 0; i < filteredItems.length; i += 15) {
    itemPages.push(filteredItems.slice(i, i + 15));
  }

  return (
    <>
      <Head>
        <title>Print Kit - {sale?.title} - FindA.Sale</title>
      </Head>

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
          }
          html, body {
            width: 100%;
            height: 100%;
          }
          .print-container {
            margin: 0;
            padding: 0.5in;
            page-break-after: always;
            page-break-inside: avoid;
          }
          .print-container:last-child {
            page-break-after: avoid;
          }
          .yard-sign {
            width: 7.5in;
            height: 10in;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 0.2in;
            text-align: center;
            page-break-after: always;
            background: white;
            color: black;
            border: none;
            box-shadow: none;
          }
          .item-tags-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-template-rows: repeat(5, 1fr);
            gap: 0.08in;
            height: 9.5in;
            page-break-inside: avoid;
          }
          .item-tag {
            border: 1pt solid #000;
            padding: 0.06in;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            background: white;
            color: black;
            page-break-inside: avoid;
            overflow: hidden;
          }
          .item-photo {
            max-width: 100%;
            max-height: 0.45in;
            object-fit: cover;
            margin: 0 auto;
          }
          .item-title {
            font-size: 7pt;
            font-weight: bold;
            line-height: 1.1;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            margin: 2pt 0;
          }
          .item-price {
            font-size: 9pt;
            font-weight: bold;
            color: black;
          }
          .item-condition {
            font-size: 7pt;
            margin-top: 1pt;
          }
          .item-qr {
            width: 50pt;
            height: 50pt;
            margin: 0 auto;
            display: block;
          }
          .item-qr-label {
            font-size: 7pt;
            color: #666;
            text-align: center;
            margin-top: 2pt;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
          }
          /* Screen overrides moved outside @media print below */
          .yard-sign-title {
            font-size: 44px;
            font-weight: bold;
            margin: 0;
            font-family: 'Fraunces', serif;
            color: black;
          }
          .yard-sign-type {
            font-size: 18px;
            font-weight: bold;
            margin: 0;
            color: black;
            background: #f3f4f6;
            padding: 0.08in 0.18in;
            border-radius: 4px;
            display: inline-block;
          }
          .yard-sign-dates {
            font-size: 30px;
            font-weight: bold;
            margin: 0;
            color: black;
          }
          .yard-sign-address {
            font-size: 16px;
            margin: 0;
            color: black;
          }
          .yard-sign-qr {
            width: 6in;
            height: 6in;
            margin: 0 auto;
          }
          .yard-sign-footer {
            font-size: 13px;
            margin: 0;
            color: black;
          }
          .yard-sign-logo {
            font-size: 14px;
            font-weight: bold;
            margin: 0;
            color: black;
          }
          .qr-full-page {
            width: 7.5in;
            height: 10in;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 0.2in;
            text-align: center;
            page-break-after: always;
            background: white;
            color: black;
            border: none;
            box-shadow: none;
          }
          .qr-full-page-last {
            page-break-after: avoid;
          }
          .qr-full-page-qr {
            width: 6in;
            height: 6in;
            margin: 0 auto;
          }
          .qr-full-page-label {
            font-size: 36px;
            font-weight: bold;
            margin: 0.3in 0 0.1in;
            color: black;
          }
          .qr-full-page-sublabel {
            font-size: 16px;
            margin: 0;
            color: black;
          }
          .qr-compact-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.25in;
            page-break-inside: avoid;
          }
          .qr-compact {
            width: 3.5in;
            height: 2.5in;
            border: 1px solid black;
            padding: 0.15in;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            background: white;
            color: black;
            page-break-inside: avoid;
          }
          .qr-compact-qr {
            width: 1.5in;
            height: 1.5in;
            margin: 0 auto;
          }
          .qr-compact-label {
            font-size: 16px;
            font-weight: bold;
            text-align: center;
            color: black;
          }
          .qr-compact-sublabel {
            font-size: 12px;
            text-align: center;
            color: black;
          }
        }
        /* Screen preview — compact readable layout, not print-sized */
        @media screen {
          .item-tags-grid {
            height: auto;
            grid-template-rows: auto;
            gap: 8px;
          }
          .item-tag {
            min-height: 120px;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
          }
          .item-qr {
            width: 48pt;
            height: 48pt;
          }
          .item-photo {
            max-height: 50px;
          }
          .item-title {
            font-size: 9pt;
          }
          .item-price {
            font-size: 11pt;
          }
          .yard-sign-qr {
            width: 4in;
            height: 4in;
          }
          .qr-full-page-qr {
            width: 4in;
            height: 4in;
          }
        }
      `}</style>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Header - Hidden in print */}
        <div className="no-print bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100">Print Kit</h1>
              {sale && (
                <p className="text-warm-600 dark:text-warm-400 text-sm mt-1">
                  {sale.title} • {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}{' '}
                  ({Math.ceil(filteredItems.length / 15)} page{Math.ceil(filteredItems.length / 15) !== 1 ? 's' : ''})
                </p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={handlePrint}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                🖨️ Print
              </button>
              <button
                onClick={handleBack}
                className="bg-warm-200 hover:bg-warm-300 text-warm-900 font-bold py-2 px-6 rounded-lg transition-colors"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400">Loading print kit...</p>
            </div>
          ) : saleError || itemsError ? (
            <div className="p-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-700 dark:text-red-400">
                Failed to load print kit. Please try again or go back.
              </p>
              <button
                onClick={handleBack}
                className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg"
              >
                Go Back
              </button>
            </div>
          ) : !sale ? (
            <div className="p-6 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-yellow-700 dark:text-yellow-400">Sale not found.</p>
              <button
                onClick={handleBack}
                className="mt-4 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-6 rounded-lg"
              >
                Go Back
              </button>
            </div>
          ) : (
            <div className="space-y-8 no-print">
              {/* Sign Templates Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Sign Templates</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {/* Yard Sign */}
                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/signs/yard`, 'yard-sign.pdf')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      📋 Yard Sign
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Full-page sign with large QR code</p>
                  </div>

                  {/* Directional Signs */}
                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/signs/directional`, 'directional-signs.pdf')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      ➡️ Directional
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Half-page signs for street corners</p>
                  </div>

                  {/* Table Tents */}
                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/signs/table-tent`, 'table-tents.pdf')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      🏕️ Table Tents
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Folded cards for tables and counters</p>
                  </div>

                  {/* Tear-Off Flyer */}
                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/signs/tear-off`, 'tear-off-flyer.pdf')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      ✂️ Tear-Off Flyer
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Large QR + rip-off tabs for bulletin boards</p>
                  </div>

                  {/* Full Kit */}
                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/signs/full-kit`, 'full-kit.pdf')}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      📦 Full Kit
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">All sign templates combined</p>
                  </div>
                </div>
              </div>

              {/* QR Item Labels Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">QR Item Labels</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 6-up Labels */}
                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/sales/${saleId}/labels`, 'item-labels.pdf')}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      🏷️ 4×3" Labels (6-up)
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">6 labels per page with QR code</p>
                  </div>

                  {/* Avery 5160 Stickers */}
                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/print-kit`, 'avery-5160-stickers.pdf')}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      📌 Avery 5160 Stickers
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Price tags & item stickers (30 per page)</p>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/signs/hang-tag`, 'hang-tags.pdf')}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      🏷️ Hang Tags
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Item-specific perforated tags (12 per page)</p>
                  </div>

                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/print-kit/price-sheet`, 'price-sheet.pdf')}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      💰 Price Sheet
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Pre-printed price cheat sheet ($0.25–$20)</p>
                  </div>
                </div>

                {/* Label Sheet Composer — prominent CTA */}
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-warm-900 dark:text-warm-100">Label Sheet Composer</h3>
                    <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">Build custom QR pricetag sheets for Avery 5160. Pick prices, set quantities, print.</p>
                  </div>
                  <Link href={`/organizer/label-composer/${saleId}`} className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-5 rounded-lg transition-colors whitespace-nowrap text-center">
                    Open Composer →
                  </Link>
                </div>
              </div>

              {/* Interactive QR Codes Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Interactive QR Codes</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Check-In / Queue QR (PRO/TEAMS only) */}
                  {isPro && (
                    <div className="text-center">
                      <button
                        onClick={() => printQRPage(`https://finda.sale/sales/${sale?.id}/checkin`, '🚶 Check In & Join the Line', 'Scan with your phone to check in, browse items, and join the virtual queue for entry.')}
                        className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                      >
                        🚶 Check-In / Queue
                      </button>
                      <p className="text-sm text-warm-600 dark:text-warm-400">Print this QR — shoppers scan to check in and join the virtual line</p>
                    </div>
                  )}

                  {/* Treasure Hunt Clues (PRO/TEAMS only) */}
                  {isPro && (
                    <>
                      {clues && clues.length > 0 ? (
                        <div className="text-center">
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {clues.map((clue, idx) => (
                              <button
                                key={clue.id}
                                onClick={() => printQRPage(`https://finda.sale/sales/${sale?.id}/treasure-hunt-qr/${clue.id}?scan=true`, `🗺️ Clue #${idx + 1}`, `Scan at this location to unlock the clue and earn XP rewards.`)}
                                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
                              >
                                🗺️ Clue #{idx + 1}{clue.category ? ` — ${clue.category}` : ''}
                              </button>
                            ))}
                          </div>
                          <p className="text-sm text-warm-600 dark:text-warm-400 mt-2">Print individual clue QRs — attach near each location</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <button
                            onClick={() => printQRPage(`https://finda.sale/sales/${sale?.id}/treasure-hunt-qr`, '🗺️ Treasure Hunt', 'Scan at this location to unlock the next clue and earn XP rewards.')}
                            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                          >
                            🗺️ Treasure Hunt
                          </button>
                          <p className="text-sm text-warm-600 dark:text-warm-400">Print this QR — attach near each clue location</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Photo Station QR (all tiers) */}
                  <div className="text-center">
                    <button
                      onClick={() => printQRPage(`https://finda.sale/sales/${sale?.id}/photo-station`, '📸 Photo Station', 'Snap a photo of your find and share it to earn XP.')}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      📸 Photo Station
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Print this QR — place at your photo spot</p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {!isLoading && !saleError && !itemsError && sale && (
            <div className="print-container space-y-0">
              {/* Yard Sign */}
              <div className="yard-sign bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 print:shadow-none print:rounded-none">
                <div className="yard-sign-title">{sale.title}</div>

                {sale.saleType && (
                  <div className="yard-sign-type">{formatSaleType(sale.saleType)}</div>
                )}

                <div className="yard-sign-dates">
                  {formatDate(sale.startDate)} – {formatDate(sale.endDate)}
                </div>

                <div className="yard-sign-address">
                  {sale.address}
                  <br />
                  {sale.city}, {sale.state} {sale.zip}
                </div>

                <img
                  src={getQRUrl(`https://finda.sale/sales/${sale.id}`, 600)}
                  alt="Sale QR Code"
                  className="yard-sign-qr"
                />

                <div className="yard-sign-footer">
                  Browse items before you arrive
                  <br />
                  finda.sale
                </div>

                <div className="yard-sign-logo">🏷️ FindA.Sale</div>
              </div>

              {/* Item Tags Pages */}
              {itemPages.map((pageItems, pageIndex) => (
                <div key={pageIndex} className="print-container bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 print:shadow-none print:rounded-none print:p-4">
                  <div className="item-tags-grid">
                    {pageItems.map((item) => (
                      <div key={item.id} className="item-tag">
                        {item.photoUrl && (
                          <Image key={item.photoUrl} src={item.photoUrl} alt={item.title} width={200} height={200} className="item-photo" unoptimized />
                        )}
                        <div className="item-title">{item.title}</div>
                        <div className="item-price">${item.price != null ? item.price.toFixed(2) : 'N/A'}</div>
                        {item.condition && (
                          <div className="item-condition">
                            <ConditionBadge condition={item.condition} />
                          </div>
                        )}
                        <div>
                          <img
                            src={getQRUrl(`https://finda.sale/items/${item.id}`, 200)}
                            alt={`QR for ${item.title}`}
                            className="item-qr"
                          />
                          <div className="item-qr-label">{item.title}</div>
                        </div>
                      </div>
                    ))}
                    {/* Fill empty slots with blank cards */}
                    {[...Array(15 - pageItems.length)].map((_, i) => (
                      <div key={`blank-${i}`} className="item-tag" />
                    ))}
                  </div>
                </div>
              ))}

              {/* Empty state */}
              {filteredItems.length === 0 && (
                <div className="p-6 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-yellow-700 dark:text-yellow-400 mb-4">
                    No available items to print. Add items to this sale first.
                  </p>
                  <Link
                    href={`/organizer/add-items/${sale.id}`}
                    className="inline-block bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-6 rounded-lg"
                  >
                    Add Items
                  </Link>
                </div>
              )}

              {/* Section 3 — Check-In / Queue QR (PRO/TEAMS only) */}
              {isPro && (
                <div className="qr-full-page bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 print:shadow-none print:rounded-none">
                  <div className="flex-1 flex flex-col justify-center items-center">
                    <img
                      src={getQRUrl(`https://finda.sale/sales/${sale.id}/checkin`, 600)}
                      alt="Check In & Join the Line QR Code"
                      className="qr-full-page-qr"
                    />
                    <div className="qr-full-page-label">Scan to Check In & Join the Line</div>
                    <div className="qr-full-page-sublabel">finda.sale</div>
                  </div>
                </div>
              )}

              {/* Section 4 — Treasure Hunt Clues QR (PRO/TEAMS only) — one full page per clue */}
              {isPro && clues && clues.length > 0 && clues.map((clue, idx) => (
                <div key={clue.id} className="qr-full-page bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 print:shadow-none print:rounded-none">
                  <div className="flex-1 flex flex-col justify-center items-center">
                    <img
                      src={getQRUrl(`https://finda.sale/sales/${sale.id}/treasure-hunt-qr/${clue.id}?scan=true`, 600)}
                      alt={`Clue ${idx + 1} QR`}
                      className="qr-full-page-qr"
                    />
                    <div className="qr-full-page-label">🗺️ Clue #{idx + 1}{clue.category ? ` — ${clue.category}` : ''}</div>
                    <div className="qr-full-page-sublabel">Scan to unlock this clue &amp; earn XP · finda.sale</div>
                  </div>
                </div>
              ))}

              {/* Section 5 — Photo Station QR (all tiers, last print page) */}
              <div className="qr-full-page qr-full-page-last bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 print:shadow-none print:rounded-none">
                <div className="flex-1 flex flex-col justify-center items-center">
                  <img
                    src={getQRUrl(`https://finda.sale/sales/${sale.id}/photo-station`, 600)}
                    alt="Photo Station QR Code"
                    className="qr-full-page-qr"
                  />
                  <div className="qr-full-page-label">Scan to snap a photo & earn XP</div>
                  <div className="qr-full-page-sublabel">FindA.Sale</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

(PrintKitPage as any).getLayout = (page: React.ReactNode) => page;

export default PrintKitPage;
