'use client';

import React, { useEffect, useState } from 'react';
import { useRippleSummary, useRecordRipple } from '@/hooks/useRipples';
import { Eye, Share2, Save, TrendingUp } from 'lucide-react';

interface RippleIndicatorProps {
  saleId: string;
  size?: 'sm' | 'md' | 'lg';
  showTrend?: boolean;
  className?: string;
}

/**
 * RippleIndicator Component
 * Displays animated ripple counts for views, shares, saves to show social proof.
 */
export const RippleIndicator: React.FC<RippleIndicatorProps> = ({
  saleId,
  size = 'md',
  showTrend = false,
  className = '',
}) => {
  const { data: summary, isLoading } = useRippleSummary(saleId);
  const { mutate: recordView } = useRecordRipple();
  const [hasRecordedView, setHasRecordedView] = useState(false);

  // Record a view event when component mounts
  useEffect(() => {
    if (!hasRecordedView && saleId) {
      recordView({ saleId, type: 'VIEW' });
      setHasRecordedView(true);
    }
  }, [saleId, hasRecordedView]);

  if (isLoading || !summary) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-6 w-32 bg-gray-200 rounded" />
      </div>
    );
  }

  const sizeClasses = {
    sm: 'text-xs gap-1',
    md: 'text-sm gap-2',
    lg: 'text-base gap-3',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <div className={`flex items-center ${sizeClasses[size]} ${className}`}>
      {/* Views */}
      <div className="flex items-center text-gray-600 hover:text-blue-600 transition">
        <Eye className={iconSizes[size]} />
        <span className="ml-1 font-medium">{formatCount(summary.views)}</span>
      </div>

      {/* Shares */}
      <div className="flex items-center text-gray-600 hover:text-green-600 transition">
        <Share2 className={iconSizes[size]} />
        <span className="ml-1 font-medium">{formatCount(summary.shares)}</span>
      </div>

      {/* Saves */}
      <div className="flex items-center text-gray-600 hover:text-yellow-600 transition">
        <Save className={iconSizes[size]} />
        <span className="ml-1 font-medium">{formatCount(summary.saves)}</span>
      </div>

      {/* Total Ripples with Trend Indicator */}
      {showTrend && (
        <div className="flex items-center text-gray-600 hover:text-purple-600 transition ml-2 pl-2 border-l">
          <TrendingUp className={iconSizes[size]} />
          <span className="ml-1 font-medium">{formatCount(summary.totalRipples)}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Format large numbers with K/M suffix
 */
function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * RippleCard Component
 * Displays ripple activity in a card layout (e.g., for sale detail pages).
 */
interface RippleCardProps {
  saleId: string;
  className?: string;
}

export const RippleCard: React.FC<RippleCardProps> = ({ saleId, className = '' }) => {
  const { data: summary, isLoading } = useRippleSummary(saleId);

  if (isLoading || !summary) {
    return (
      <div className={`bg-gray-50 rounded-lg p-4 animate-pulse ${className}`}>
        <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-3 w-24 bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div
      className={`bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-100 ${className}`}
    >
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Activity Ripples</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col items-center p-3 bg-white rounded-lg border border-blue-100">
          <Eye className="w-5 h-5 text-blue-500 mb-2" />
          <span className="text-2xl font-bold text-gray-900">{formatCount(summary.views)}</span>
          <span className="text-xs text-gray-500 mt-1">Views</span>
        </div>

        <div className="flex flex-col items-center p-3 bg-white rounded-lg border border-green-100">
          <Share2 className="w-5 h-5 text-green-500 mb-2" />
          <span className="text-2xl font-bold text-gray-900">{formatCount(summary.shares)}</span>
          <span className="text-xs text-gray-500 mt-1">Shares</span>
        </div>

        <div className="flex flex-col items-center p-3 bg-white rounded-lg border border-yellow-100">
          <Save className="w-5 h-5 text-yellow-500 mb-2" />
          <span className="text-2xl font-bold text-gray-900">{formatCount(summary.saves)}</span>
          <span className="text-xs text-gray-500 mt-1">Saves</span>
        </div>

        <div className="flex flex-col items-center p-3 bg-white rounded-lg border border-purple-100">
          <TrendingUp className="w-5 h-5 text-purple-500 mb-2" />
          <span className="text-2xl font-bold text-gray-900">{formatCount(summary.totalRipples)}</span>
          <span className="text-xs text-gray-500 mt-1">Total</span>
        </div>
      </div>

      {summary.lastRippleAt && (
        <p className="text-xs text-gray-500 mt-4 text-center">
          Last activity: {new Date(summary.lastRippleAt).toLocaleString()}
        </p>
      )}
    </div>
  );
};
