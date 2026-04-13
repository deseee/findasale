/**
 * HoldMetricsCard Component
 * Summary: holdsCreated, holdsExpired, holdsConverted
 * Prominently displays noShowRate
 */

import React from 'react';

interface HoldMetricsData {
  holdsCreated: number;
  holdsExpired: number;
  holdsCancelled: number;
  holdsConverted: number;
  noShowRate: number;
}

interface HoldMetricsCardProps {
  data: HoldMetricsData;
}

const HoldMetricsCard: React.FC<HoldMetricsCardProps> = ({ data }) => {
  const getNoShowColor = (rate: number) => {
    if (rate > 0.3) return 'text-red-600 bg-red-50';
    if (rate > 0.2) return 'text-amber-600 bg-amber-50';
    return 'text-green-600 bg-green-50';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-600">
      <h3 className="text-lg font-semibold text-warm-900 mb-4">Hold Performance</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center">
          <p className="text-3xl font-bold text-warm-900">{data.holdsCreated}</p>
          <p className="text-xs text-warm-600 mt-1">Created</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-amber-600">{data.holdsConverted}</p>
          <p className="text-xs text-warm-600 mt-1">Converted</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-orange-600">{data.holdsExpired}</p>
          <p className="text-xs text-warm-600 mt-1">Expired</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-gray-600">{data.holdsCancelled}</p>
          <p className="text-xs text-warm-600 mt-1">Cancelled</p>
        </div>
      </div>

      <div className={`p-4 rounded-lg ${getNoShowColor(data.noShowRate)}`}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-75">
          No-Show Rate
        </p>
        <p className="text-3xl font-bold">{(data.noShowRate * 100).toFixed(1)}%</p>
        <p className="text-xs mt-2 opacity-75">
          {data.noShowRate > 0.25
            ? '⚠️ High no-show rate detected'
            : '✓ Healthy conversion rate'}
        </p>
      </div>

      {data.holdsCreated > 0 && (
        <div className="mt-4 pt-4 border-t border-warm-200">
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-700">Conversion Rate</span>
            <span className="font-semibold text-warm-900">
              {((data.holdsConverted / data.holdsCreated) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-warm-200 rounded-full h-2 mt-2">
            <div
              className="bg-green-600 h-2 rounded-full"
              style={{
                width: `${(data.holdsConverted / data.holdsCreated) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default HoldMetricsCard;
