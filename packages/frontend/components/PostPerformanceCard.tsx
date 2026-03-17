import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ClickStats {
  totalClicks: number;
  clicksByDay: Array<{ date: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
}

interface PostPerformanceCardProps {
  saleId: string;
  stats?: ClickStats | null;
  isLoading?: boolean;
}

export default function PostPerformanceCard({
  saleId,
  stats,
  isLoading = false,
}: PostPerformanceCardProps) {
  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="h-6 w-40 bg-warm-200 rounded mb-4 animate-pulse"></div>
        <div className="h-64 bg-warm-100 rounded animate-pulse"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card p-6 text-center">
        <p className="text-warm-600 text-sm">No click data yet.</p>
      </div>
    );
  }

  const topSource = stats.topSources.length > 0 ? stats.topSources[0] : null;

  return (
    <div className="card p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-warm-900 mb-2">Post Performance</h3>
        <p className="text-warm-600 text-sm">Last 7 days of social link clicks</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-warm-50 rounded-lg p-4">
          <p className="text-warm-600 text-xs font-semibold uppercase mb-1">Total Clicks</p>
          <p className="text-3xl font-bold text-amber-600">{stats.totalClicks}</p>
        </div>
        <div className="bg-warm-50 rounded-lg p-4">
          <p className="text-warm-600 text-xs font-semibold uppercase mb-1">Top Source</p>
          <p className="text-lg font-semibold text-warm-900">{topSource?.source || 'N/A'}</p>
          {topSource && <p className="text-xs text-warm-500">{topSource.count} clicks</p>}
        </div>
      </div>

      {/* 7-Day Sparkline */}
      <div className="mb-4">
        <p className="text-sm font-semibold text-warm-900 mb-3">7-Day Trend</p>
        {stats.clicksByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.clicksByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5D5C8" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#8FB897' }}
                tickFormatter={(val) => {
                  const date = new Date(val);
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#8FB897' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFF',
                  border: '1px solid #E5D5C8',
                  borderRadius: '4px',
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#D4A574"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-warm-500 text-sm">No data available</p>
        )}
      </div>

      {/* Source Breakdown */}
      {stats.topSources.length > 0 && (
        <div className="border-t border-warm-200 pt-4">
          <p className="text-sm font-semibold text-warm-900 mb-3">Top Sources</p>
          <div className="space-y-2">
            {stats.topSources.map((source) => (
              <div key={source.source} className="flex justify-between items-center">
                <span className="text-sm text-warm-700 capitalize">{source.source}</span>
                <span className="text-sm font-semibold text-warm-900">{source.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
