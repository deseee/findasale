/**
 * RecommendationsPanel Component
 * Seasonal pricing suggestions + action items
 */

import React from 'react';

interface SeasonalPricingTip {
  category: string;
  basePrice: number;
  seasonalFactor: number;
  recommendedPrice: number;
  rationale: string;
  confidence: number;
}

interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  estimate: string;
}

interface RecommendationsPanelProps {
  seasonalPricingTips: SeasonalPricingTip[];
  actionItems: ActionItem[];
}

const RecommendationsPanel: React.FC<RecommendationsPanelProps> = ({
  seasonalPricingTips,
  actionItems,
}) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return { bg: 'bg-green-100', text: 'text-green-800', label: 'High' };
    if (confidence >= 0.6) return { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Medium' };
    return { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Low' };
  };

  return (
    <div className="space-y-6">
      {/* Seasonal Pricing Tips */}
      {seasonalPricingTips.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-warm-900 mb-4">Seasonal Pricing Tips</h3>
          <div className="space-y-4">
            {seasonalPricingTips.map((tip) => {
              const confidenceBadge = getConfidenceBadge(tip.confidence);
              const priceChange = ((tip.seasonalFactor - 1) * 100).toFixed(0);

              return (
                <div
                  key={tip.category}
                  className="p-4 border border-warm-200 rounded-lg hover:shadow transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <h4 className="font-semibold text-warm-900 capitalize mb-1">
                        {tip.category}
                      </h4>
                      <p className="text-sm text-warm-700 mb-2">{tip.rationale}</p>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap flex-shrink-0 ${confidenceBadge.bg} ${confidenceBadge.text}`}>
                      {confidenceBadge.label} Confidence
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-warm-600 uppercase font-semibold">Base Price</p>
                      <p className="text-lg font-bold text-warm-900">
                        ${tip.basePrice.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-warm-600 uppercase font-semibold">Adjustment</p>
                      <p className={`text-lg font-bold ${priceChange.startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>
                        {priceChange.startsWith('-') ? '' : '+'}{priceChange}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-warm-600 uppercase font-semibold">Recommended</p>
                      <p className="text-lg font-bold text-amber-600">
                        ${tip.recommendedPrice.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-warm-900 mb-4">Action Items</h3>
          <div className="space-y-3">
            {actionItems.map((item, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border ${getPriorityColor(item.priority)}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold">{item.title}</h4>
                  <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap flex-shrink-0 ${getPriorityColor(item.priority)}`}>
                    {item.priority.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm opacity-75 mb-2">{item.reason}</p>
                <p className="text-xs opacity-60 italic">{item.estimate}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {seasonalPricingTips.length === 0 && actionItems.length === 0 && (
        <div className="bg-warm-50 rounded-lg p-6 text-center text-warm-600">
          No recommendations yet. Continue tracking your sales to get insights.
        </div>
      )}
    </div>
  );
};

export default RecommendationsPanel;
