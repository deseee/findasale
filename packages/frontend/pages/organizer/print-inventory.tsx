/**
 * Organizer Print Inventory Page
 *
 * Allows organizers to view and print a full inventory list grouped by sale and category.
 * Features:
 * - Fetch all items across all organizer sales
 * - Group items by sale → category
 * - Table columns: Title, Category, Condition, Price, Status
 * - Print CSS to hide navigation and show only the table
 * - Print and Back buttons
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';
import Link from 'next/link';

interface Item {
  id: string;
  title: string;
  category: string;
  condition: string;
  price: number;
  auctionStartPrice?: number;
  status: string;
  saleId: string;
}

interface Sale {
  id: string;
  title: string;
  items?: Item[];
}

interface SaleGroup {
  saleTitle: string;
  categories: Record<string, Item[]>;
}

interface GroupedData {
  [saleId: string]: SaleGroup;
}

const PrintInventoryPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [groupedData, setGroupedData] = useState<GroupedData>({});

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Fetch organizer's sales
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['organizer-sales', user?.id],
    queryFn: async () => {
      const response = await api.get('/organizer/sales');
      return response.data;
    },
    enabled: !!user?.id,
  });

  // Fetch all items for all sales
  const { data: inventoryData, isLoading: itemsLoading, error: itemsError } = useQuery<
    Array<{ saleId: string; saleTitle: string; items: Item[] }>
  >({
    queryKey: ['organizer-inventory', salesData?.sales],
    queryFn: async () => {
      if (!salesData?.sales || salesData.sales.length === 0) {
        return [];
      }

      // Fetch items for each sale in parallel
      const itemsPromises = salesData.sales.map((sale: Sale) =>
        api.get('/items', { params: { saleId: sale.id } })
          .then((res) => ({ saleId: sale.id, saleTitle: sale.title, items: res.data as Item[] }))
          .catch(() => ({ saleId: sale.id, saleTitle: sale.title, items: [] as Item[] }))
      );

      return Promise.all(itemsPromises);
    },
    enabled: !!salesData?.sales && salesData.sales.length > 0,
  });

  // Group inventory data whenever it changes (replaces removed onSuccess)
  useEffect(() => {
    if (!inventoryData) return;
    const grouped: GroupedData = {};
    inventoryData.forEach((saleData) => {
      grouped[saleData.saleId] = { saleTitle: saleData.saleTitle, categories: {} };
      saleData.items.forEach((item) => {
        const category = item.category || 'Uncategorized';
        if (!grouped[saleData.saleId].categories[category]) {
          grouped[saleData.saleId].categories[category] = [];
        }
        grouped[saleData.saleId].categories[category].push(item);
      });
    });
    setGroupedData(grouped);
  }, [inventoryData]);

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    router.push('/organizer/dashboard');
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const isLoading = salesLoading || itemsLoading;
  const totalItems = Object.values(groupedData).reduce(
    (sum, sale) =>
      sum + Object.values(sale.categories).reduce((catSum, items) => catSum + items.length, 0),
    0
  );

  return (
    <>
      <Head>
        <title>Print Inventory - FindA.Sale</title>
      </Head>

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            font-size: 12pt;
            margin: 0;
            padding: 0;
            background: white;
          }
          .print-container {
            page-break-after: auto;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: avoid;
          }
          tr {
            page-break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
          .section-title {
            page-break-after: avoid;
            margin-top: 20pt;
            margin-bottom: 10pt;
          }
          .category-header {
            background-color: #f5f5f5 !important;
            font-weight: bold;
            page-break-after: avoid;
          }
        }
      `}</style>

      <div className="min-h-screen bg-warm-50">
        {/* Header - Hidden in print */}
        <div className="no-print bg-white border-b border-warm-200 px-4 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-warm-900">Print Inventory</h1>
              <p className="text-warm-600 text-sm mt-1">
                All items grouped by sale and category
              </p>
            </div>
            <div className="flex gap-2">
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
              <p className="text-warm-600">Loading inventory...</p>
            </div>
          ) : itemsError ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">Failed to load inventory. Please try again.</p>
            </div>
          ) : totalItems === 0 ? (
            <div className="text-center py-12">
              <p className="text-warm-600 mb-4">No items in your inventory yet.</p>
              <Link
                href="/organizer/add-items"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg"
              >
                Add Items
              </Link>
            </div>
          ) : (
            <div className="print-container space-y-8">
              {/* Summary */}
              <div className="no-print bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-warm-900 mb-4">Summary</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-warm-600 text-sm">Total Sales</p>
                    <p className="text-3xl font-bold text-warm-900">
                      {Object.keys(groupedData).length}
                    </p>
                  </div>
                  <div>
                    <p className="text-warm-600 text-sm">Total Items</p>
                    <p className="text-3xl font-bold text-amber-600">{totalItems}</p>
                  </div>
                  <div>
                    <p className="text-warm-600 text-sm">Total Value</p>
                    <p className="text-3xl font-bold text-green-600">
                      $
                      {Object.values(groupedData)
                        .reduce((sum, sale) =>
                          sum + Object.values(sale.categories).reduce(
                            (catSum, items) =>
                              catSum + items.reduce(
                                (itemSum, item) => itemSum + (item.price || item.auctionStartPrice || 0),
                                0
                              ),
                            0
                          ),
                          0
                        )
                        .toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sales with grouped items */}
              {Object.entries(groupedData).map(([saleId, saleData]) => {
                const categories = Object.keys(saleData.categories);
                const saleItemCount = categories.reduce(
                  (sum, category) => sum + saleData.categories[category].length,
                  0
                );

                return (
                  <div key={saleId} className="bg-white rounded-lg shadow-md overflow-hidden">
                    {/* Sale title */}
                    <div className="bg-amber-50 border-b border-amber-200 px-6 py-4">
                      <h2 className="text-xl font-bold text-amber-900">
                        {saleData.saleTitle}
                      </h2>
                      <p className="text-sm text-amber-700 mt-1">
                        {saleItemCount} item{saleItemCount !== 1 ? 's' : ''} • {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
                      </p>
                    </div>

                    {/* Items table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm-200 bg-warm-50">
                            <th className="text-left py-3 px-4 font-semibold text-warm-700">
                              Title
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-warm-700">
                              Category
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-warm-700">
                              Condition
                            </th>
                            <th className="text-right py-3 px-4 font-semibold text-warm-700">
                              Price
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-warm-700">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {categories.map((category) => {
                            const items = saleData.categories[category];
                            return (
                              <React.Fragment key={category}>
                                {/* Category header row */}
                                <tr className="category-header border-b border-warm-200 bg-warm-100">
                                  <td colSpan={5} className="py-2 px-4 text-sm font-semibold text-warm-900">
                                    {category}
                                  </td>
                                </tr>

                                {/* Item rows */}
                                {items.map((item) => (
                                  <tr
                                    key={item.id}
                                    className="border-b border-warm-100 hover:bg-warm-50"
                                  >
                                    <td className="py-3 px-4 text-warm-900 font-medium">
                                      {item.title}
                                    </td>
                                    <td className="py-3 px-4 text-warm-600 capitalize">
                                      {category}
                                    </td>
                                    <td className="py-3 px-4 text-warm-600 capitalize">
                                      {item.condition || '—'}
                                    </td>
                                    <td className="py-3 px-4 text-right font-semibold text-warm-900">
                                      $
                                      {(item.price || item.auctionStartPrice || 0).toFixed(2)}
                                    </td>
                                    <td className="py-3 px-4">
                                      <span
                                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                          item.status === 'SOLD'
                                            ? 'bg-green-100 text-green-700'
                                            : item.status === 'AVAILABLE'
                                              ? 'bg-blue-100 text-blue-700'
                                              : item.status === 'ON_HOLD'
                                                ? 'bg-yellow-100 text-yellow-700'
                                                : 'bg-warm-100 text-warm-700'
                                        }`}
                                      >
                                        {item.status === 'ON_HOLD'
                                          ? 'On Hold'
                                          : item.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PrintInventoryPage;
