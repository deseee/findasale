/**
 * Price Research Panel Component — Condensed Layout v2
 *
 * Consolidates 5 pricing/valuation tools into one collapsible section:
 * 1. AI Estimate — read-only if item has estimatedValue or aiSuggestedPrice
 * 2. Suggest Price (💡) — PriceSuggestion component
 * 3. eBay Price Comps (💰) — eBay search results
 * 4. Platform Comps (💰) — ValuationWidget (PRO-only)
 * 5. Request Community Appraisal (🤝) — crowdsourced valuation
 *
 * Props:
 * - itemId: string (for ValuationWidget)
 * - itemTitle: string (for eBay search, appraisal)
 * - itemDescription?: string (for appraisal form)
 * - category: string (for PriceSuggestion, appraisal)
 * - condition: string (for PriceSuggestion)
 * - currentPrice?: number
 * - photoUrls?: string[] (for appraisal request)
 * - aiEstimate?: number (AI estimated value if available)
 * - collapsed?: boolean (default collapsed state)
 * - onPriceSelect?: (price: number) => void (called when user selects a price)
 */

import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { useCreateAppraisal } from '../hooks/useAppraisal';
import PriceSuggestion from './PriceSuggestion';
import ValuationWidget from './ValuationWidget';

interface PriceResearchPanelProps {
  itemId: string;
  itemTitle: string;
  itemDescription?: string;
  category: string;
  condition: string;
  currentPrice?: number;
  photoUrls?: string[];
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
  itemDescription,
  category,
  condition,
  currentPrice,
  photoUrls = [],
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

  const createAppraisal = useCreateAppraisal();
  const [appraisalSubmitting, setAppraisalSubmitting] = useState(false);
  const [showAppraisalConfirm, setShowAppraisalConfirm] = useState(false);
  const [appraisalCost, setAppraisalCost] = useState(0);
  const [userTier, setUserTier] = useState<string>('SIMPLE');

  // Determine appraisal cost based on tier
  const APPRAISAL_XP_COST = 50;

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

  const handleRequestAppraisal = async () => {
    if (!photoUrls || photoUrls.length === 0) {
      showToast('Add at least one photo before requesting appraisal', 'info');
      return;
    }

    if (!user) {
      showToast('Please sign in to request an appraisal', 'error');
      return;
    }

    // Determine tier and cost
    const tier = user.organizerTier || 'SIMPLE';
    setUserTier(tier);

    // All tiers pay XP for appraisal
    const userXp = user.guildXp || 0;
    if (userXp < APPRAISAL_XP_COST) {
      showToast(
        `You need ${APPRAISAL_XP_COST} XP to request an appraisal. You have ${userXp} XP.`,
        'error'
      );
      return;
    }
    setAppraisalCost(APPRAISAL_XP_COST);

    // Show confirmation dialog
    setShowAppraisalConfirm(true);
  };

  const handleConfirmAppraisal = async () => {
    setAppraisalSubmitting(true);
    try {
      createAppraisal.mutate(
        {
          itemTitle: itemTitle,
          itemDescription: itemDescription || '',
          itemCategory: category || '',
          photoUrls: photoUrls,
        },
        {
          onSuccess: () => {
            showToast('🤝 Appraisal request submitted! Community will estimate value.', 'success');
            setShowAppraisalConfirm(false);
          },
          onError: (error: any) => {
            const message = error?.response?.data?.message || 'Failed to submit appraisal request';
            showToast(message, 'error');
            setShowAppraisalConfirm(false);
          },
          onSettled: () => {
            setAppraisalSubmitting(false);
          },
        }
      );
    } catch (error: any) {
      showToast('Error submitting appraisal request', 'error');
      setAppraisalSubmitting(false);
      setShowAppraisalConfirm(false);
    }
  };

  return (
    <>
      <div className="border border-warm-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
        {/* Collapsible Header — Condensed */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
        >
          <h3 className="font-fraunces font-semibold text-sm text-warm-900 dark:text-warm-100 flex items-center gap-2">
            🔍 Price Research
          </h3>
          <span className="text-warm-500 text-sm">
            {isCollapsed ? '▶' : '▼'}
          </span>
        </button>

      {/* Panel Content — Compact Layout */}
      {!isCollapsed && (
        <div className="border-t border-warm-200 dark:border-gray-700 px-4 py-3 space-y-2.5">
          {/* AI Estimate — Top Priority */}
          {aiEstimate && (
            <>
              <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-0.5">
                  🤖 Smart Estimate
                </p>
                <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                  ${aiEstimate.toFixed(2)}
                </p>
              </div>
              <div className="border-t border-warm-100 dark:border-gray-800" />
            </>
          )}

          {/* Smart Pricing — Compact Section */}
          <div>
            <p className="text-xs font-semibold text-warm-700 dark:text-warm-300 mb-1">
              ⚡ Smart Pricing
            </p>
            <p className="text-xs text-warm-500 dark:text-warm-400 mb-1.5">
              Based on title, category & condition
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

          <div className="border-t border-warm-100 dark:border-gray-800" />

          {/* eBay Market Comps — Compact */}
          <div>
            <p className="text-xs font-semibold text-warm-700 dark:text-warm-300 mb-1">
              💰 eBay Market Comps
            </p>
            <button
              type="button"
              onClick={handleGetPriceComps}
              disabled={compsLoading}
              className="px-2.5 py-1 border border-blue-500 text-blue-500 dark:text-blue-400 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {compsLoading ? 'Searching...' : 'Search eBay'}
            </button>
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
              Real sold prices for similar items
            </p>

            {showCompsPanel && compsData && (
              <div
                className={`mt-1.5 p-2 rounded-lg border text-xs ${
                  compsData.isMockData
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                }`}
              >
                <p className="font-semibold text-warm-800 dark:text-warm-200 mb-1">
                  {compsData.isMockData ? '⚠️ Demo data' : `✓ ${compsData.count || 0} listings found`}
                </p>
                {compsData.isMockData && (
                  <p className="text-amber-700 dark:text-amber-300 mb-1">
                    eBay credentials not configured
                  </p>
                )}
                {compsData.count > 0 && (
                  <div className="space-y-1">
                    <p className="text-warm-700 dark:text-warm-300">
                      <span className="font-medium">Range:</span> ${compsData.min.toFixed(2)}–${compsData.max.toFixed(2)} | <span className="font-medium">Median:</span> ${compsData.median.toFixed(2)}
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (onPriceSelect) {
                            onPriceSelect(compsData.median);
                          }
                          showToast(`Price set to $${compsData.median.toFixed(2)}`, 'success');
                        }}
                        className="flex-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                      >
                        Use ${compsData.median.toFixed(2)}
                      </button>
                      <a
                        href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(itemTitle)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-2 py-0.5 bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium rounded transition-colors text-center"
                      >
                        eBay ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-warm-100 dark:border-gray-800" />

          {/* Platform Comps (ValuationWidget — PRO only) — Compact */}
          <div>
            <p className="text-xs font-semibold text-warm-700 dark:text-warm-300 mb-1">
              📊 Sales Comps (PRO)
            </p>
            <p className="text-xs text-warm-500 dark:text-warm-400 mb-1.5">
              Comparable sale prices from FindA.Sale
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

          <div className="border-t border-warm-100 dark:border-gray-800" />

          {/* Request Community Appraisal — Full Width Button at Bottom */}
          <div>
            <button
              type="button"
              onClick={handleRequestAppraisal}
              disabled={appraisalSubmitting || photoUrls.length === 0}
              className="w-full px-4 py-2.5 bg-[#4A7C59] hover:bg-[#3d654a] disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <span>🤝</span>
              <span>
                {appraisalSubmitting
                  ? 'Submitting Appraisal...'
                  : photoUrls.length === 0
                  ? 'Add Photo to Request Appraisal'
                  : 'Request Community Appraisal'}
              </span>
            </button>
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
              Get crowdsourced value estimates from the community
            </p>
          </div>
        </div>
      )}
      </div>

      {/* Appraisal Cost Confirmation Modal */}
      {showAppraisalConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-fraunces font-semibold text-warm-900 dark:text-warm-100 mb-3">
              Request Community Appraisal
            </h3>

            {/* Cost Information */}
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              {appraisalCost > 0 ? (
                <>
                  <p className="text-sm text-warm-700 dark:text-warm-300 mb-2">
                    <span className="font-medium">Cost:</span> {appraisalCost} XP
                  </p>
                  <p className="text-sm text-warm-600 dark:text-warm-400">
                    <span className="font-medium">Your balance:</span> {user?.guildXp || 0} XP
                  </p>
                </>
              ) : (
                <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                  ✓ Free for {userTier} tier members
                </p>
              )}
            </div>

            {/* Message */}
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-5">
              Submit your item for community valuation. Community members will provide price estimates based on your photos.
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowAppraisalConfirm(false)}
                disabled={appraisalSubmitting}
                className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAppraisal}
                disabled={appraisalSubmitting}
                className="flex-1 px-4 py-2 bg-[#4A7C59] hover:bg-[#3d654a] disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {appraisalSubmitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PriceResearchPanel;
