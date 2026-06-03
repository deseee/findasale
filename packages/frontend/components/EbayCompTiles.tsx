import React from 'react';
import { useItemEbayComps, EbayComp } from '../hooks/useItemEbayComps';

interface EbayCompTilesProps {
  itemId?: string;
}

const CAMP_ID = '5339148447';

/**
 * Build an eBay Partner Network rover URL for affiliate tracking.
 */
const buildEpnUrl = (url: string): string =>
  `https://rover.ebay.com/rover/1/711-53200-19255-0/1?toolid=10001&campid=${CAMP_ID}&mpre=${encodeURIComponent(url)}`;

/**
 * EbayCompTiles — Shopper-facing display of comparable eBay listings.
 *
 * Shows up to 3 eBay listings with EPN affiliate links so shoppers can
 * see what comparable items sell for on eBay. Cards are fully clickable
 * and open eBay in a new tab via rover.ebay.com affiliate links.
 *
 * Also used on the organizer edit-item page to show market comps.
 * Renders nothing if no comps with valid listing URLs are available.
 */
const EbayCompTiles: React.FC<EbayCompTilesProps> = ({ itemId }: EbayCompTilesProps) => {
  const { comps, isLoading } = useItemEbayComps(itemId);

  if (isLoading) return null;

  // Only show comps that have a listing URL we can linkify
  const displayComps = comps.filter((c: EbayComp) => !!c.ebayListingUrl).slice(0, 3);

  if (displayComps.length === 0) return null;

  return (
    <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          Shop Similar on{' '}
          <span className="text-blue-600 dark:text-blue-400">
            e<span className="font-extrabold">Bay</span>
          </span>
        </p>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.22 11.78a.75.75 0 0 1 0-1.06L9.44 5.5H5.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 0 1-1.06 0Z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
        See what comparable items are selling for
      </p>

      {/* Grid — 3 columns desktop, horizontal scroll mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 overflow-x-auto">
        {displayComps.map((comp: EbayComp) => (
          <CompCard key={comp.id} comp={comp} />
        ))}
      </div>
    </div>
  );
};

/**
 * CompCard — Individual clickable eBay comp card with EPN affiliate link.
 */
const CompCard: React.FC<{ comp: EbayComp }> = ({ comp }: { comp: EbayComp }) => {
  const price = comp.ebayPrice ? `$${comp.ebayPrice.toFixed(2)}` : 'See price';
  const condition = comp.ebayCondition ?? 'See listing';
  const epnHref = buildEpnUrl(comp.ebayListingUrl!);

  return (
    <a
      href={epnHref}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col bg-white dark:bg-gray-800 border border-amber-100 dark:border-amber-900 rounded-lg overflow-hidden cursor-pointer transition-all duration-150 hover:shadow-md hover:scale-[1.02] hover:border-amber-300 dark:hover:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
    >
      {/* Image */}
      <div className="w-full aspect-square bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
        {comp.ebayImageUrl ? (
          <img
            src={comp.ebayImageUrl}
            alt={comp.ebayTitle ?? 'eBay listing'}
            className="w-full h-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              const parent = img.parentElement;
              if (parent) {
                parent.innerHTML =
                  '<span class="text-blue-600 dark:text-blue-400 font-extrabold text-lg">eBay</span>';
              }
            }}
          />
        ) : (
          <span className="text-blue-600 dark:text-blue-400 font-extrabold text-lg">eBay</span>
        )}
      </div>

      {/* Content */}
      <div className="p-2 flex flex-col gap-1 flex-1">
        {/* Title */}
        {comp.ebayTitle && (
          <p className="text-xs text-gray-700 dark:text-gray-200 line-clamp-2 leading-tight">
            {comp.ebayTitle}
          </p>
        )}

        {/* Price */}
        <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
          {price}
        </p>

        {/* Condition badge */}
        <span className="inline-block self-start text-[10px] font-medium px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded-full truncate max-w-full">
          {condition}
        </span>

        {/* CTA */}
        <p className="mt-auto pt-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
          View on eBay →
        </p>
      </div>
    </a>
  );
};

export default EbayCompTiles;
