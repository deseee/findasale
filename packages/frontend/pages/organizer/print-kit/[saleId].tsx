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
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
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
    S: { bg: '#10b981', text: '#ffffff', label: 'S - Mint' },
    A: { bg: '#3b82f6', text: '#ffffff', label: 'A - Excellent' },
    B: { bg: '#f59e0b', text: '#ffffff', label: 'B - Good' },
    C: { bg: '#ef4444', text: '#ffffff', label: 'C - Fair' },
    D: { bg: '#6b7280', text: '#ffffff', label: 'D - Poor' },
  };

  const info = conditionMap[condition] || conditionMap['D'];

  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: info.bg,
        color: info.text,
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 'bold',
      }}
    >
      {condition}
    </span>
  );
};

const PrintKitPage: React.FC<PrintKitPageProps> = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
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
      const response = await api.get('/items', { params: { saleId } });
      return response.data as Item[];
    },
    enabled: !!saleId && typeof saleId === 'string',
  });

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    router.push('/organizer/dashboard');
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

  // Chunk items into groups of 6 for pagination
  const itemPages = [];
  for (let i = 0; i < filteredItems.length; i += 6) {
    itemPages.push(filteredItems.slice(i, i + 6));
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
          }
          .print-container:last-child {
            page-break-after: auto;
          }
          .yard-sign {
            width: 7.5in;
            height: 10in;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            page-break-after: always;
            background: white;
            color: black;
            border: none;
            box-shadow: none;
          }
          .item-tags-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.5in;
            page-break-inside: avoid;
          }
          .item-tag {
            width: 3.5in;
            height: 2in;
            border: 1px solid black;
            padding: 0.2in;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            background: white;
            color: black;
            page-break-inside: avoid;
          }
          .item-photo {
            max-width: 100%;
            max-height: 0.8in;
            object-fit: cover;
            margin: 0 auto;
          }
          .item-title {
            font-size: 10px;
            font-weight: bold;
            line-height: 1.2;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            margin: 4px 0;
          }
          .item-price {
            font-size: 18px;
            font-weight: bold;
            color: black;
          }
          .item-condition {
            font-size: 9px;
            margin-top: 4px;
          }
          .item-qr {
            width: 0.8in;
            height: 0.8in;
            margin: 4px auto;
          }
          .yard-sign-title {
            font-size: 48px;
            font-weight: bold;
            margin: 0.3in 0;
            font-family: 'Fraunces', serif;
            color: black;
          }
          .yard-sign-type {
            font-size: 18px;
            font-weight: bold;
            margin: 0.1in 0;
            color: black;
            background: #f3f4f6;
            padding: 0.1in 0.2in;
            border-radius: 4px;
            display: inline-block;
          }
          .yard-sign-dates {
            font-size: 28px;
            font-weight: bold;
            margin: 0.2in 0;
            color: black;
          }
          .yard-sign-address {
            font-size: 14px;
            margin: 0.2in 0;
            color: black;
          }
          .yard-sign-qr {
            width: 2in;
            height: 2in;
            margin: 0.2in auto;
          }
          .yard-sign-footer {
            font-size: 12px;
            margin-top: 0.2in;
            color: black;
          }
          .yard-sign-logo {
            font-size: 14px;
            font-weight: bold;
            margin-top: 0.1in;
            color: black;
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
                  ({Math.ceil(filteredItems.length / 6)} page{Math.ceil(filteredItems.length / 6) !== 1 ? 's' : ''})
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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

                  {/* Hang Tags */}
                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/signs/hang-tag`, 'hang-tags.pdf')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      🏷️ Hang Tags
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">8 perforated tags per page</p>
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
                    <p className="text-sm text-warm-600 dark:text-warm-400">One label per page with QR code</p>
                  </div>

                  {/* Avery 5160 Stickers */}
                  <div className="text-center">
                    <button
                      onClick={() => downloadAuthenticatedFile(`${apiBase}/organizers/${saleId}/print-kit`, 'avery-5160-stickers.pdf')}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-2"
                    >
                      📌 Avery 5160 Stickers
                    </button>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Price tags & item stickers (12 per page)</p>
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
              </div>

              {/* Legacy Print Preview */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Print Preview</h2>
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
                  src={getQRUrl(`https://finda.sale/sales/${sale.id}`)}
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
                          <img key={item.photoUrl} src={item.photoUrl} alt={item.title} className="item-photo" />
                        )}
                        <div className="item-title">{item.title}</div>
                        <div className="item-price">${item.price != null ? item.price.toFixed(2) : 'N/A'}</div>
                        <div className="item-condition">
                          <ConditionBadge condition={item.condition || ''} />
                        </div>
                        <img
                          src={getQRUrl(`https://finda.sale/items/${item.id}`, 80)}
                          alt="Item QR Code"
                          className="item-qr"
                        />
                      </div>
                    ))}
                    {/* Fill empty slots with blank cards */}
                    {[...Array(6 - pageItems.length)].map((_, i) => (
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
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PrintKitPage;
