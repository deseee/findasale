import Link from 'next/link';

// Shared types — defined locally (NO @findasale/shared import; that breaks the Vercel build).
export interface MetroBreakdown {
  estate: number;
  yard: number;
  auction: number;
  flea: number;
  other: number;
}

export interface MetroRow {
  city: string;
  state: string;
  slug: string;
  total: number;
  breakdown: MetroBreakdown;
}

interface MetroTableProps {
  metros: MetroRow[];
  /** When true, render plain text instead of Next.js Links (for the chrome-free embed). */
  embed?: boolean;
  /** Optional cap on rows rendered (e.g. top 25 for the embed). */
  limit?: number;
}

/**
 * Ranked metro table for the Weekend Sale Index.
 * Each row links to the live /estate-sales/{slug} city page (full page only).
 * In embed mode the metro name is plain text (the embed has a single backlink
 * in its footer rather than per-row links).
 */
export default function MetroTable({ metros, embed = false, limit }: MetroTableProps) {
  const rows = typeof limit === 'number' ? metros.slice(0, limit) : metros;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-warm-200 dark:border-gray-700 text-xs uppercase tracking-wide text-warm-500 dark:text-warm-400">
            <th className="py-3 pr-3 font-semibold">#</th>
            <th className="py-3 pr-4 font-semibold">Metro</th>
            <th className="py-3 px-2 text-right font-semibold">Total</th>
            <th className="py-3 px-2 text-right font-semibold">Estate</th>
            <th className="py-3 px-2 text-right font-semibold">Yard</th>
            <th className="py-3 px-2 text-right font-semibold">Auction</th>
            <th className="py-3 px-2 text-right font-semibold">Flea</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <tr
              key={`${m.slug}`}
              className="border-b border-warm-100 dark:border-gray-800 hover:bg-warm-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <td className="py-2.5 pr-3 text-warm-400 dark:text-warm-500 tabular-nums">
                {i + 1}
              </td>
              <td className="py-2.5 pr-4 font-medium text-warm-900 dark:text-warm-100">
                {embed ? (
                  <span>
                    {m.city}, {m.state}
                  </span>
                ) : (
                  <Link
                    href={`/city/${m.slug}/estate-sales`}
                    className="text-amber-700 dark:text-amber-400 hover:underline"
                  >
                    {m.city}, {m.state}
                  </Link>
                )}
              </td>
              <td className="py-2.5 px-2 text-right font-semibold tabular-nums text-warm-900 dark:text-warm-100">
                {m.total.toLocaleString()}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums text-warm-600 dark:text-warm-300">
                {m.breakdown.estate.toLocaleString()}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums text-warm-600 dark:text-warm-300">
                {m.breakdown.yard.toLocaleString()}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums text-warm-600 dark:text-warm-300">
                {m.breakdown.auction.toLocaleString()}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums text-warm-600 dark:text-warm-300">
                {m.breakdown.flea.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
