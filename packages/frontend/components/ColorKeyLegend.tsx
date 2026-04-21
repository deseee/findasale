/**
 * Feature #310: ColorKeyLegend component
 * Displays active discount rules with color swatches for shoppers
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface DiscountRule {
  id: string;
  tagColor: string;
  label: string;
  discountPercent: number;
  activeFrom: string | null;
  activeTo: string | null;
}

interface ColorKeyLegendProps {
  saleId?: string;
  itemsExist?: boolean;
  isOrganizerView?: boolean;
}

/**
 * Fetches and displays the color-coded discount legend.
 * Only shown for organizer on their own sale, when TEAMS tier is present.
 * Fetches rules from /api/discount-rules (which validates TEAMS subscription).
 */
export default function ColorKeyLegend({
  saleId,
  itemsExist = true,
  isOrganizerView = false,
}: ColorKeyLegendProps) {
  const { user } = useAuth();

  // Only fetch rules if user is an organizer (they can see the legend)
  const { data: rules = [] } = useQuery({
    queryKey: ['discount-rules'],
    queryFn: async () => {
      try {
        const response = await api.get('/discount-rules');
        return response.data;
      } catch (err: any) {
        // If API returns 403 (not TEAMS tier), fail silently and return empty
        if (err.response?.status === 403) {
          return [];
        }
        throw err;
      }
    },
    enabled: isOrganizerView && user?.roles?.includes('ORGANIZER'),
  });

  // Filter to only active rules (based on current time)
  const activeRules = useMemo(() => {
    const now = new Date();
    return rules.filter((rule: DiscountRule) => {
      const from = rule.activeFrom ? new Date(rule.activeFrom) : null;
      const to = rule.activeTo ? new Date(rule.activeTo) : null;
      if (from && now < from) return false; // Not started yet
      if (to && now > to) return false; // Expired
      return true;
    });
  }, [rules]);

  // Don't show if no active rules or no items in sale
  if (activeRules.length === 0 || !itemsExist) {
    return null;
  }

  return (
    <div className="bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 rounded-lg p-4 mb-6">
      <h3 className="text-sm font-bold text-warm-900 dark:text-warm-100 mb-3">
        Color Discount Key
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeRules.map((rule: DiscountRule) => (
          <div
            key={rule.id}
            className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded p-3 border border-warm-200 dark:border-gray-600"
          >
            {/* Color swatch */}
            <div
              className="w-8 h-8 rounded border-2 border-warm-300 dark:border-gray-500 flex-shrink-0"
              style={{ backgroundColor: rule.tagColor }}
              title={`Color: ${rule.tagColor}`}
            />
            {/* Label and discount */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-warm-900 dark:text-warm-100 truncate">
                {rule.label}
              </p>
              <p className="text-xs font-bold text-green-600 dark:text-green-400">
                {rule.discountPercent}% off
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
