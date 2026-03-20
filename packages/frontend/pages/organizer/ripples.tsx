import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useRouter } from 'next/router';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Eye, Share2, Save, TrendingUp } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * DTO for ripple summary (counts by type)
 */
type RippleSummaryDTO = {
  saleId: string;
  views: number;
  shares: number;
  saves: number;
  bids: number;
  totalRipples: number;
  lastRippleAt: string | null; // ISO date string
};

/**
 * DTO for ripple trend data (hourly breakdown)
 */
type RippleTrendDTO = {
  saleId: string;
  hourlyData: Array<{
    hour: string; // ISO date string, rounded to hour
    viewCount: number;
    shareCount: number;
    saveCount: number;
    bidCount: number;
  }>;
  totalRipples: number;
  trendPeriodHours: number;
};

interface SaleWithRipples extends RippleSummaryDTO {
  saleTitle: string;
}

/**
 * Ripples Analytics Page for Organizers
 * Displays ripple activity across all organizer's sales.
 */
export default function RipplesPage() {
  const router = useRouter();
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [trendHours, setTrendHours] = useState(24);

  // Fetch organizer's sales with ripple summaries
  const {
    data: salesWithRipples,
    isLoading: loadingSales,
  } = useQuery<SaleWithRipples[], Error>({
    queryKey: ['organizer', 'sales', 'ripples'],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/organizers/me/sales`);
      const sales = res.data;

      // Fetch ripple summary for each sale
      const withRipples = await Promise.all(
        sales.map(async (sale: any) => {
          try {
            const rippleRes = await axios.get(`${API_BASE}/sales/${sale.id}/ripples/summary`);
            return {
              ...rippleRes.data,
              saleTitle: sale.title,
            };
          } catch (err) {
            console.error(`Failed to fetch ripples for sale ${sale.id}:`, err);
            return {
              saleId: sale.id,
              saleTitle: sale.title,
              views: 0,
              shares: 0,
              saves: 0,
              bids: 0,
              totalRipples: 0,
              lastRippleAt: null,
            };
          }
        })
      );

      return withRipples.sort((a, b) => b.totalRipples - a.totalRipples);
    },
  });

  // Fetch trend data for selected sale
  const {
    data: trendData,
    isLoading: loadingTrend,
  } = useQuery<RippleTrendDTO, Error>({
    queryKey: ['ripples', 'trend', selectedSaleId, trendHours],
    queryFn: async () => {
      if (!selectedSaleId) throw new Error('No sale selected');
      const res = await axios.get(`${API_BASE}/sales/${selectedSaleId}/ripples/trend`, {
        params: { hours: trendHours },
      });
      return res.data;
    },
    enabled: !!selectedSaleId,
  });

  // Set initial selected sale
  React.useEffect(() => {
    if (salesWithRipples && salesWithRipples.length > 0 && !selectedSaleId) {
      setSelectedSaleId(salesWithRipples[0].saleId);
    }
  }, [salesWithRipples, selectedSaleId]);

  const selectedSale = salesWithRipples?.find((s) => s.saleId === selectedSaleId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Sale Ripples Analytics</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Monitor social proof activity (views, shares, saves) across your sales
          </p>
        </div>

        {/* Sales Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Sales List */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your Sales</h2>
              </div>

              <div className="divide-y max-h-96 overflow-y-auto">
                {loadingSales ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">Loading sales...</div>
                ) : salesWithRipples && salesWithRipples.length > 0 ? (
                  salesWithRipples.map((sale) => (
                    <button
                      key={sale.saleId}
                      onClick={() => setSelectedSaleId(sale.saleId)}
                      className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition ${
                        selectedSaleId === sale.saleId ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{sale.saleTitle}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          <TrendingUp className="w-4 h-4 inline mr-1" />
                          {sale.totalRipples}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">No sales found</div>
                )}
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={Eye} label="Views" value={selectedSale?.views || 0} color="blue" />
              <StatCard
                icon={Share2}
                label="Shares"
                value={selectedSale?.shares || 0}
                color="green"
              />
              <StatCard
                icon={Save}
                label="Saves"
                value={selectedSale?.saves || 0}
                color="yellow"
              />
              <StatCard
                icon={TrendingUp}
                label="Total Activity"
                value={selectedSale?.totalRipples || 0}
                color="purple"
              />
            </div>
          </div>
        </div>

        {/* Trend Chart */}
        {selectedSale && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Activity Trend</h2>
              <div className="flex gap-2">
                {[24, 72, 168].map((hours) => (
                  <button
                    key={hours}
                    onClick={() => setTrendHours(hours)}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition ${
                      trendHours === hours
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    {hours === 24 ? '24h' : hours === 72 ? '3d' : '7d'}
                  </button>
                ))}
              </div>
            </div>

            {loadingTrend ? (
              <div className="h-96 flex items-center justify-center text-gray-500 dark:text-gray-400">
                Loading trend data...
              </div>
            ) : trendData && trendData.hourlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={trendData.hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(value: string) => new Date(value).toLocaleTimeString()}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(value: string) => new Date(value).toLocaleString()}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="viewCount"
                    stroke="#3b82f6"
                    name="Views"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="shareCount"
                    stroke="#10b981"
                    name="Shares"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="saveCount"
                    stroke="#f59e0b"
                    name="Saves"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-500 dark:text-gray-400">
                No trend data available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * StatCard Component
 */
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-100',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 border-green-100',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  return (
    <div className={`rounded-lg border p-6 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{label}</p>
          <p className="text-3xl font-bold mt-2">{value.toLocaleString()}</p>
        </div>
        <Icon className="w-12 h-12 opacity-20" />
      </div>
    </div>
  );
}
