/**
 * Price Research Panel Component
 *
 * Consolidates 4 pricing tools into one collapsible section:
 * 1. AI Estimate — read-only if item has estimatedValue or aiSuggestedPrice
 * 2. Suggest Price (💡) — PriceSuggestion component
 * 3. eBay Price Comps (💰) — eBay search results
 * 4. Platform Comps (💰) — ValuationWidget (PRO-only)
 *
 * Props:
 * - itemId: string (for ValuationWidget)
 * - itemTitle: string (for eBay search)
 * - category: string (for PriceSuggestion)
 * - condition: string (for PriceSuggestion)
 * - currentPrice?: number
 * - aiEstimate?: number (AI estimated value if available)
 * - collapsed?: boolean (default collapsed state)
 * - onPriceSelect?: (price: number) => void (called when user selects a price)
 */

import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import PriceSuggestion from './PriceSuggestion';
import ValuationWidget from './ValuationWidget';

interface PriceResearchPanelProps {
  itemId: string;
  itemTitle: string;
  category: string;
  condition: string;
  currentPrice?: number;
  aiEstimate?: number;
  collapsed?: boolean;
  onPriceSelect?: (price: number) => void;
}

interface CompsData {
  count: number;
  min: number;
  max: number;
  median: number;
  isMockData: boolean;
}

const PriceResearchPanel: React.FC<PriceResearchPanelProps> = ({
  itemId,
  itemTitle,
  category,
  condition,
  currentPrice,
  aiEstimate,
  collapsed = false,
  onPriceSelect,
}) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsData, setCompsData] = useState<CompsData | null>(null);
  const [showCompsPanel, setShowCompsPanel] = useState(false);

  const handleGetPriceComps = async () => {
    if (!itemTitle.trim()) {
      showToast('Please enter an item title first', 'error');
      return;
    }

    setCompsLoading(true);
    try {
      const response = await api.post(`/items/${itemId}/comps`);
      setCompsData(response.data);
      setShowCompsPanel(true);
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to fetch eBay price comps';
      showToast(message, 'error');
    } finally {
      setCompsLoading(false);
    }
  };

  return (
    <div className="border border-warm-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
      >
        <h3 className="font-semibold text-warm-900 dark:text-warm-100 flex items-center gap-2">
          🔍 Price Research
        </h3>
        <span className="text-warm-500 text-sm">
          {isCollapsed ? '▶' : '▼'}
        </span>
      </button>

      {/* Panel Content */}
      {!isCollapsed && (
        <div className="border-t border-warm-200 dark:border-gray-700 p-4 space-y-3">
          {/* AI Estimate */}
          {aiEstimate && (
            <>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                      🤖 Smart Estimate
                    </p>
                    <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                      ${aiEstimate.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
              <hr className="border-warm-100 dark:border-gray-800" />
            </>
          )}

          {/* Smart Pricing (⚡) */}
          <div>
            <p className="text-xs font-semibold text-warm-700 dark:text-warm-300 mb-2">
              ⚡ Smart Pricing
            </p>
            <p className="text-xs text-warm-500 dark:text-warm-400 mb-2">
              Price estimate based on title, category & condition
            </p>
            <PriceSuggestion
              title={itemTitle}
              category={category}
              condition={condition}
              onApplyPrice={(price) => {
                if (onPriceSelect) {
                  onPriceSelect(price);
                } else {
                  showToast(`Price suggestion: $${price.toFixed(2)}`, 'info');
                }
              }}
            />
          </div>

          <hr className="border-warm-100 dark:border-gray-800" />

          {/* eBay Price Comps */}
          <div>
            <p className="text-xs font-semibold text-warm-700 dark:text-warm-300 mb-2">
              💰 eBay Market Comps
            </p>
            <button
              type="button"
              onClick={handleGetPriceComps}
              disabled={compsLoading}
              className="px-3 py-1.5 border border-blue-500 text-blue-500 dark:text-blue-400 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {compsLoading ? 'Searching eBay...' : 'Search eBay Sold Listings'}
            </button>
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-1 mb-2">
              Real sold prices from eBay for similar items
            </p>

            {showCompsPanel && compsData && (
              <div
                className={`mt-2 p-3 rounded-lg border ${
                  compsData.isMockData
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                }`}
              >
                <p className="text-sm font-semibold text-warm-800 dark:text-warm-200 mb-2">
                  {compsData.isMockData ? '⚠️ Demo data' : `✓ Found ${compsData.count || 0} sold listings`}
                </p>
                {compsData.isMockData && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                    eBay credentials not configured — showing sample data
                  </p>
                )}
                {compsData.count > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-warm-700 dark:text-warm-300">
                      <span className="font-medium">Range:</span> ${compsData.min.toFixed(2)} – ${compsData.max.toFixed(2)} |{' '}
                      <span className="font-medium">Median:</span> ${compsData.median.toFixed(2)}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onPriceSelect) {
                            onPriceSelect(compsData.median);
                          }
                          showToast(`Price set to $${compsData.median.toFixed(2)}`, 'success');
                        }}
                        className="flex-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
                      >
                        Use ${compsData.median.toFixed(2)}
                      </button>
                      <a
                        href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(itemTitle)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded transition-colors text-center"
                      >
                        View on eBay ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <hr className="border-warm-100 dark:border-gray-800" />

          {/* Platform Comps (ValuationWidget — PRO only) */}
          <div>
            <p className="text-xs font-semibold text-warm-700 dark:text-warm-300 mb-2">
              📊 Sales Comps (PRO)
            </p>
            <p className="text-xs text-warm-500 dark:text-warm-400 mb-2">
              Comparable sale prices from within FindA.Sale
            </p>
            <ValuationWidget
              itemId={itemId}
              currentPrice={currentPrice}
              onPriceSelect={(price) => {
                if (onPriceSelect) {
                  onPriceSelect(price);
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceResearchPanel;
