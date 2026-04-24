import React from 'react';
import { useItemEbayComps, EbayComp } from '../hooks/useItemEbayComps';

interface EbayCompTilesProps {
  itemId?: string;
}

/**
 * EbayCompTiles — Visual display of top eBay comparable sales.
 *
 * Shows 2–3 recent eBay sold listings with images and prices on the item edit page.
 * Helps organizers see real market prices when setting their own prices.
 *
 * Design: Matches EncyclopediaInlineTip aesthetic (amber-50 bg, dark mode support).
 * Mobile-friendly: tiles wrap on small screens.
 * Renders nothing if no comps available.
 */
const EbayCompTiles: React.FC<EbayCompTilesProps> = ({ itemId }: EbayCompTilesProps) => {
  const { comps, isLoading } = useItemEbayComps(itemId);

  // No comps — render nothing
  if (!comps || comps.length === 0) {
    return null;
  }

  // While loading — render nothing (no skeleton flash)
  if (isLoading) {
    return null;
  }

  // Take top 3 comps
  const displayComps = comps.slice(0, 3);

  return (
    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
      <p className="text-xs font-medium text-amber-900 dark:text-amber-100 mb-2">
        Similar items sold on eBay:
      </p>
      <div className="flex flex-wrap gap-2">
        {displayComps.map((comp: EbayComp) => (
          <CompTile key={comp.id} comp={comp} />
        ))}
      </div>
    </div>
  );
};

/**
 * CompTile — Individual eBay comp tile (image, price, condition).
 */
const CompTile: React.FC<{ comp: EbayComp }> = ({ comp }: { comp: EbayComp }) => {
  const price = comp.ebayPrice ? `$${comp.ebayPrice.toFixed(2)}` : 'N/A';
  const condition = comp.ebayCondition ? comp.ebayCondition : 'Condition unknown';

  return (
    <div className="flex flex-col items-center gap-1 p-2 bg-white dark:bg-gray-800 border border-amber-100 dark:border-amber-900 rounded-md transition-colors hover:bg-amber-50 dark:hover:bg-gray-700">
      {/* Image or Placeholder */}
      <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
        {comp.ebayImageUrl ? (
          <img
            src={comp.ebayImageUrl}
            alt="eBay comp"
            className="w-full h-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              const parent = img.parentElement;
              if (parent) {
                parent.innerHTML = '<span class="text-amber-600 dark:text-amber-400 font-bold text-sm">eBay</span>';
              }
            }}
          />
        ) : (
          <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">eBay</span>
        )}
      </div>

      {/* Price */}
      <p className="text-xs font-bold text-amber-900 dark:text-amber-100 text-center">
        {price}
      </p>

      {/* Condition */}
      <p className="text-xs text-amber-800 dark:text-amber-200 text-center line-clamp-1">
        {condition}
      </p>

      {/* Label */}
      <p className="text-xs text-amber-700 dark:text-amber-300 font-medium text-center">
        Sold on eBay
      </p>
    </div>
  );
};

export default EbayCompTiles;
