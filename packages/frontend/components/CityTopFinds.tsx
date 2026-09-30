import Link from 'next/link';
import Image from 'next/image';
import { getItemImageUrl, isCloudinaryUrl } from '../lib/imageUtils';

/**
 * CityTopFinds (ADR-074 city cluster, wired 2026-09-29).
 *
 * Fresh, real items from PUBLISHED sales in the city, from GET /api/cities/:slug/finds.
 * Copy is deliberately literal: the price is the current asking price. A "% off" badge and a
 * struck-through original price appear ONLY when the item carries a real original price above the
 * current price (the API sends savingsPct and originalPrice as null otherwise). The earlier draft
 * of this component said "Sold for" and "Estimated" against eBay rows, which are not data we hold.
 */
export interface CityFindCard {
  id: string;
  title: string;
  price: number;
  originalPrice: number | null;
  savingsPct: number | null;
  condition?: string | null;
  photoUrl?: string | null;
}

interface CityTopFindsProps {
  cityName: string;
  items: CityFindCard[];
}

export function CityTopFinds({ cityName, items }: CityTopFindsProps) {
  // No items means no section. An empty "check back soon" block is thin content on a page
  // that is otherwise fully populated.
  if (!items.length) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 pb-8" aria-labelledby="city-fresh-finds">
      <h2 id="city-fresh-finds" className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-1">
        Fresh Finds in {cityName}
      </h2>
      <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
        Recently listed items from sales in {cityName}. Best savings first.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((item) => {
          const src = item.photoUrl ? getItemImageUrl(item.photoUrl) || item.photoUrl : null;
          return (
            <Link
              key={item.id}
              href={`/items/${item.id}`}
              className="group card overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="relative aspect-square bg-warm-100 dark:bg-gray-800 overflow-hidden">
                {src ? (
                  <Image
                    src={src}
                    alt={item.title}
                    fill
                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform"
                    unoptimized={isCloudinaryUrl(src)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-warm-400 dark:text-gray-500">
                    No photo
                  </div>
                )}
                {item.savingsPct !== null && item.savingsPct !== undefined && (
                  <span className="absolute top-2 left-2 text-xs font-semibold bg-green-600 text-white px-2 py-0.5 rounded-full">
                    {item.savingsPct}% off
                  </span>
                )}
              </div>
              <div className="p-3">
                <h3 className="text-sm font-medium text-warm-900 dark:text-warm-100 line-clamp-2 group-hover:text-amber-600">
                  {item.title}
                </h3>
                {item.condition && (
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">{item.condition}</p>
                )}
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-base font-bold text-warm-900 dark:text-warm-100">${item.price.toFixed(2)}</span>
                  {item.originalPrice !== null && item.originalPrice !== undefined && item.savingsPct !== null && (
                    <span className="text-xs line-through text-warm-400 dark:text-gray-500">${item.originalPrice.toFixed(2)}</span>
                  )}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-4 text-sm">
        <a href="#city-sales" className="text-amber-600 hover:text-amber-700 font-medium">
          Browse all sales in {cityName} &darr;
        </a>
      </p>
    </section>
  );
}
