import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Zap } from 'lucide-react';

interface PricingSignal {
  sleeper: SleeperAlert | null;
  brandPremium: BrandPremiumAlert | null;
}

interface SleeperAlert {
  patternName: string;
  displayLabel: string;
  currentPrice: number;
  estimatedLow: number;
  estimatedHigh: number;
  confidence: number;
}

interface BrandPremiumAlert {
  brand: string;
  multiplier: number;
  sampleSize: number;
  appreciationMode: string;
}

interface PricingSignalBannersProps {
  itemId: string;
  currentPrice?: number;
}

/**
 * PricingSignalBanners
 * Displays AI-detected sleeper patterns and brand premium warnings on edit-item pages
 * and in review flows. Supports localStorage-based dismissal.
 */
export const PricingSignalBanners: React.FC<PricingSignalBannersProps> = ({
  itemId,
  currentPrice,
}) => {
  const [dismissedSleeper, setDismissedSleeper] = useState(false);
  const [dismissedBrand, setDismissedBrand] = useState(false);

  // Load dismissal state from localStorage
  useEffect(() => {
    const sleeperKey = `sleeper_dismissed_${itemId}`;
    const brandKey = `brand_premium_dismissed_${itemId}`;
    if (typeof window !== 'undefined') {
      setDismissedSleeper(localStorage.getItem(sleeperKey) === 'true');
      setDismissedBrand(localStorage.getItem(brandKey) === 'true');
    }
  }, [itemId]);

  // Fetch pricing signals for this item
  const { data: signals, isLoading } = useQuery<PricingSignal>({
    queryKey: ['pricing-signals', itemId],
    queryFn: async () => {
      const res = await fetch(`/api/items/${itemId}/pricing-signals`);
      if (!res.ok) throw new Error('Failed to fetch pricing signals');
      return res.json();
    },
  });

  const handleDismissSleeper = () => {
    const key = `sleeper_dismissed_${itemId}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, 'true');
    }
    setDismissedSleeper(true);
  };

  const handleDismissBrand = () => {
    const key = `brand_premium_dismissed_${itemId}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, 'true');
    }
    setDismissedBrand(true);
  };

  if (isLoading || !signals) {
    return null;
  }

  const banners = [];

  // Sleeper Pattern Banner
  if (
    signals.sleeper &&
    !dismissedSleeper &&
    signals.sleeper.confidence >= 0.6
  ) {
    const delta =
      ((signals.sleeper.estimatedLow - signals.sleeper.currentPrice) /
        signals.sleeper.currentPrice) *
      100;

    if (delta >= 15) {
      banners.push(
        <div
          key="sleeper-banner"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                💡 Potential Underpriced Item
              </h3>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                This item matches the pattern &quot;{signals.sleeper.displayLabel}
                &quot; and may be underpriced. Similar items typically sell for{' '}
                <strong>
                  ${signals.sleeper.estimatedLow.toFixed(2)} –{' '}
                  ${signals.sleeper.estimatedHigh.toFixed(2)}
                </strong>
                . Yours is currently listed at{' '}
                <strong>${signals.sleeper.currentPrice.toFixed(2)}</strong>.
                Consider adjusting your price.
              </p>
            </div>
            <button
              onClick={handleDismissSleeper}
              className="flex-shrink-0 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              aria-label="Dismiss sleeper alert"
            >
              ✕
            </button>
          </div>
        </div>
      );
    }
  }

  // Brand Premium Banner
  if (
    signals.brandPremium &&
    !dismissedBrand &&
    signals.brandPremium.multiplier >= 1.15 &&
    signals.brandPremium.sampleSize >= 3
  ) {
    const premiumPct = (
      (signals.brandPremium.multiplier - 1) *
      100
    ).toFixed(0);

    banners.push(
      <div
        key="brand-banner"
        className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20"
      >
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100">
              ✨ Brand Premium Opportunity
            </h3>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              <strong>{signals.brandPremium.brand}</strong> items in this
              category typically sell at a {premiumPct}% premium. Based on{' '}
              {signals.brandPremium.sampleSize} recent comparable sales,
              consider pricing your item higher to match market expectations.
            </p>
          </div>
          <button
            onClick={handleDismissBrand}
            className="flex-shrink-0 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
            aria-label="Dismiss brand premium alert"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return <>{banners}</>;
};

export default PricingSignalBanners;
