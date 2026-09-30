import Link from 'next/link';

/**
 * CityNearbyLinks (ADR-074 city cluster, wired 2026-09-29).
 *
 * Internal links from a city page to nearby cities that have live sales and to the per-type
 * views of this city (/city/[slug]/[category]). ADR-074 section 4.4 asks for exactly this
 * internal linking depth; it was the "nearby cities" gap left when the legacy per-type city pages
 * were redirected.
 *
 * Takes plain, already-resolved links so it stays a dumb view: the page decides which cities
 * qualify (must have live sales) and which types exist.
 */
export interface CityNearbyLink {
  slug: string;
  label: string;
}

export interface CityTypeLink {
  href: string;
  label: string;
}

interface CityNearbyLinksProps {
  cityName: string;
  nearbyCities: CityNearbyLink[];
  typeLinks: CityTypeLink[];
}

export function CityNearbyLinks({ cityName, nearbyCities, typeLinks }: CityNearbyLinksProps) {
  const nearby = nearbyCities.slice(0, 5);
  if (nearby.length === 0 && typeLinks.length === 0) return null;

  const chip =
    'px-3 py-1.5 rounded-full text-sm border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:border-amber-500 hover:text-amber-600 transition-colors';

  return (
    <section className="max-w-5xl mx-auto px-4 pb-8" aria-label={`More sales near ${cityName}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {nearby.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-3">Nearby Cities</h2>
            <div className="flex flex-wrap gap-2">
              {nearby.map((c) => (
                <Link key={c.slug} href={`/city/${c.slug}`} className={chip}>
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        )}
        {typeLinks.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-3">Browse {cityName} by Sale Type</h2>
            <div className="flex flex-wrap gap-2">
              {typeLinks.map((t) => (
                <Link key={t.href} href={t.href} className={chip}>
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
