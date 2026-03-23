import React, { useState } from 'react';
import { planRoute, RouteResult, RouteError } from '../lib/routeApi';

interface RouteSale {
  id: string;
  title: string;
  lat: number;
  lng: number;
  address: string;
  city: string;
  state: string;
}

interface RouteBuilderProps {
  sales: RouteSale[];
}

const MAX_SELECTIONS = 5;
const MIN_SELECTIONS = 2;

const RouteBuilder: React.FC<RouteBuilderProps> = ({ sales }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECTIONS) {
        next.add(id);
      }
      return next;
    });
    setResult(null);
    setError(null);
  };

  const handlePlan = async () => {
    if (selected.size < MIN_SELECTIONS) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setFallbackUrl(null);
    try {
      const res = await planRoute(Array.from(selected));
      setResult(res);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: RouteError } };
      const data = axiosErr.response?.data;
      setError(data?.error ?? 'Could not plan route. Please try again.');
      if (data?.fallbackUrl) setFallbackUrl(data.fallbackUrl);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelected(new Set());
    setResult(null);
    setError(null);
    setFallbackUrl(null);
  };

  const salesWithCoords = sales.filter((s) => s.lat && s.lng);

  if (salesWithCoords.length < MIN_SELECTIONS) return null;

  return (
    <div className="bg-white dark:bg-gray-800 border-t border-warm-200 dark:border-gray-700">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span className="font-semibold text-warm-900 dark:text-warm-100 text-sm">Plan Your Route</span>
          {selected.size >= MIN_SELECTIONS && !isOpen && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {selected.size} selected
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-warm-500 dark:text-warm-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4 dark:bg-gray-800">
          <p className="text-xs text-warm-500 dark:text-warm-400">
            Select {MIN_SELECTIONS}–{MAX_SELECTIONS} sales to get drive times and distances.
          </p>

          {/* Sale checkboxes */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {salesWithCoords.map((sale) => {
              const checked = selected.has(sale.id);
              const disabled = !checked && selected.size >= MAX_SELECTIONS;
              return (
                <label
                  key={sale.id}
                  className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    checked
                      ? 'bg-amber-50 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-700'
                      : disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-warm-50 dark:hover:bg-gray-700 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => !disabled && toggle(sale.id)}
                    className="mt-0.5 accent-amber-600 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-warm-900 dark:text-warm-100 truncate">{sale.title}</p>
                    <p className="text-xs text-warm-500 dark:text-warm-400 truncate">
                      {sale.address}, {sale.city}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handlePlan}
              disabled={selected.size < MIN_SELECTIONS || loading}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Planning…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Plan Route ({selected.size}/{MAX_SELECTIONS})
                </>
              )}
            </button>
            {(selected.size > 0 || result) && (
              <button
                onClick={handleReset}
                className="text-sm text-warm-500 hover:text-warm-700 px-3 py-2 rounded-lg hover:bg-warm-100 transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {/* Error state */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              <p>{error}</p>
              {fallbackUrl && (
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-red-700 dark:text-red-300 underline font-medium"
                >
                  Open in Google Maps instead →
                </a>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center gap-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 text-sm">
                <span className="font-semibold text-amber-800 dark:text-amber-300">
                  {result.summary.totalDistanceMi} mi
                </span>
                <span className="text-warm-400 dark:text-warm-500">·</span>
                <span className="text-amber-700 dark:text-amber-300">~{result.summary.totalDurationMin} min drive</span>
              </div>

              {/* Ordered stops */}
              <ol className="space-y-2">
                {result.waypoints.map((wp) => (
                  <li key={wp.saleId} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {wp.order}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-warm-900 dark:text-warm-100 truncate">{wp.title}</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400 truncate">{wp.address}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Export button */}
              <a
                href={result.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full border border-amber-600 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20 text-sm font-medium py-2 px-4 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open in Google Maps
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RouteBuilder;
