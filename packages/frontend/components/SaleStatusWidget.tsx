/**
 * SaleStatusWidget — Feature #14: Real-Time Status Dashboard Card
 *
 * Displays live counters for organizers:
 * - Items Sold Today
 * - Active Holds
 * - Items Remaining
 * - Revenue Today
 *
 * Uses sage-green accent (#8FB897) for numbers.
 * Props: { saleId: string }
 */

import React from 'react';
import { useSaleStatus } from '../hooks/useSaleStatus';

interface SaleStatusWidgetProps {
  saleId: string;
}

export const SaleStatusWidget: React.FC<SaleStatusWidgetProps> = ({ saleId }) => {
  const { status, isLoading, error } = useSaleStatus(saleId);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-600">Failed to load real-time updates: {error}</p>
      </div>
    );
  }

  if (isLoading || !status) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse bg-gray-100 h-20 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const sageGreen = '#8FB897';

  const StatBox: React.FC<{
    label: string;
    value: string | number;
    unit?: string;
  }> = ({ label, value, unit }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
      <p className="text-xs text-gray-600 font-medium mb-2">{label}</p>
      <div className="flex items-baseline justify-center gap-1">
        <p
          className="text-3xl font-bold"
          style={{ color: sageGreen }}
        >
          {value}
        </p>
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Live Sale Status</h3>
      <div className="grid grid-cols-2 gap-4">
        <StatBox label="Sold Today" value={status.itemsSoldToday} />
        <StatBox label="Active Holds" value={status.activeHolds} />
        <StatBox label="Items Remaining" value={status.itemsRemaining} />
        <StatBox
          label="Revenue Today"
          value={`$${status.revenueToday.toFixed(0)}`}
        />
      </div>
      <p className="text-xs text-gray-400 mt-4 text-center">
        Updated {new Date(status.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
};

export default SaleStatusWidget;
