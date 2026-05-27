interface DirectoryOrganizer {
  id: string;
  businessName: string;
  address: string;
  website: string | null;
  googleRating: number | null;
  googleRatingCount: number | null;
  businessCategory: string | null;
  claimStatus: string;
}

interface CityDirectorySectionProps {
  cityName: string;
  cityState: string;
  organizers: DirectoryOrganizer[];
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: full }).map((_, i) => (
        <svg key={`f${i}`} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      {half && (
        <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
          <defs>
            <linearGradient id="half">
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <path fill="url(#half)" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <svg key={`e${i}`} className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export function CityDirectorySection({
  cityName,
  cityState,
  organizers,
}: CityDirectorySectionProps) {
  if (!organizers.length) return null;

  return (
    <section className="py-12 px-4 md:px-8 bg-white dark:bg-slate-900">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Sale Organizers in {cityName}, {cityState}
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Estate sale companies, auction houses, flea market operators, and resale organizers operating in this area.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {organizers.map((org) => (
            <div
              key={org.id}
              className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5 border border-slate-200 dark:border-slate-700 flex flex-col gap-3"
            >
              {/* Name + category */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug">
                  {org.businessName}
                </h3>
                {org.businessCategory && (
                  <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {org.businessCategory}
                  </span>
                )}
              </div>

              {/* Address */}
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug">
                {org.address}
              </p>

              {/* Google rating */}
              {org.googleRating != null && (
                <div className="flex items-center gap-2">
                  <StarRating rating={Number(org.googleRating)} />
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {Number(org.googleRating).toFixed(1)}
                    {org.googleRatingCount != null && (
                      <span className="ml-1 text-slate-400 dark:text-slate-500">
                        ({org.googleRatingCount.toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Footer: website + claim CTA */}
              <div className="flex items-center gap-3 mt-auto pt-1 flex-wrap">
                {org.website && (
                  <a
                    href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Visit website
                  </a>
                )}
                {org.claimStatus === 'UNCLAIMED' && (
                  <a
                    href={`/claim?id=${org.id}`}
                    className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    Claim this listing
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
