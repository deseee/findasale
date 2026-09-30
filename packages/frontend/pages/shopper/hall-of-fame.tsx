/**
 * Hall of Fame page (Phase 2b, polished 2026-09-29).
 *
 * Public page, no authentication. Data: GET /api/guild/hall-of-fame.
 *  - allTimeGrandmasters: real (every user whose explorerRank is GRANDMASTER, by guild XP).
 *  - seasonalTop100: only fills after a season reset has stamped users; renders an honest empty state until then.
 *
 * Privacy: the API returns full names, so this page shows first name plus last initial ("Jane D.").
 * The API also should not return full names or user ids (see backend report), but the page never
 * prints more than the short form.
 *
 * Profile links use /shopper/profile/[userId] (that route takes a user id, not a slug).
 */

import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../lib/api';

interface GrandmasterEntry {
  rank: number;
  userId: string;
  name: string | null;
  profileSlug?: string | null;
  /** True only when the member's profile is public; a private profile 404s, so it must not be linked. */
  profilePublic?: boolean;
  guildXp: number;
  explorerRank: 'GRANDMASTER';
}

interface SeasonalEntry {
  rank: number;
  userId: string;
  name: string | null;
  profileSlug?: string | null;
  profilePublic?: boolean;
  guildXp: number;
  explorerRank: 'SAGE' | 'GRANDMASTER';
}

interface HallOfFameData {
  allTimeGrandmasters: GrandmasterEntry[];
  seasonalTop100: SeasonalEntry[];
}

const RANK_STYLES: Record<string, string> = {
  SAGE: 'bg-amber-500',
  GRANDMASTER: 'bg-purple-600',
};

const RANK_NAMES: Record<string, string> = {
  SAGE: 'Sage',
  GRANDMASTER: 'Grandmaster',
};

/** "Jane Doe" becomes "Jane D."; a single name stays as is; missing names become "Explorer". */
function shortDisplayName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Explorer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-white dark:bg-slate-950">
    <Head>
      <title>Hall of Fame | FindA.Sale</title>
      <meta
        name="description"
        content="The most accomplished treasure hunters in the Explorer's Guild: all-time Grandmasters and this season's leaders."
      />
      <link rel="canonical" href="https://finda.sale/shopper/hall-of-fame" />
    </Head>
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">{children}</div>
  </div>
);

const EmptyBox = ({ children }: { children: React.ReactNode }) => (
  <div className="text-center py-10 px-4 bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
    <p className="text-gray-600 dark:text-gray-400">{children}</p>
  </div>
);

export default function HallOfFame() {
  const [data, setData] = useState<HallOfFameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.get('/guild/hall-of-fame');
      setData(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <PageShell>
        <div className="text-center mb-10">
          <div className="h-10 w-56 mx-auto rounded bg-gray-200 dark:bg-slate-800 animate-pulse" />
        </div>
        <div className="space-y-3" role="status" aria-label="Loading Hall of Fame">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 dark:bg-slate-900 animate-pulse" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="text-center py-16">
          <p className="text-gray-800 dark:text-gray-200 mb-4">The Hall of Fame could not be loaded right now.</p>
          <button
            onClick={load}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-2 rounded-lg"
          >
            Try again
          </button>
        </div>
      </PageShell>
    );
  }

  const grandmasters = data?.allTimeGrandmasters ?? [];
  const seasonal = data?.seasonalTop100 ?? [];

  return (
    <PageShell>
      <div className="text-center mb-10 sm:mb-12">
        <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-2">Hall of Fame</h1>
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">
          The most accomplished treasure hunters in the Explorer&apos;s Guild
        </p>
      </div>

      {/* All-time Grandmasters */}
      <section className="mb-14" aria-labelledby="hof-grandmasters">
        <h2 id="hof-grandmasters" className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6">
          <span aria-hidden="true">👑 </span>Grandmasters
        </h2>

        {grandmasters.length > 0 ? (
          <ol className="space-y-3">
            {grandmasters.map((member) => (
              <li
                key={member.userId}
                className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/60 dark:to-yellow-950/40 rounded-lg p-4 border-l-4 border-purple-600"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="text-center min-w-10 sm:min-w-12">
                      <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{member.rank}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Place</p>
                    </div>
                    <div className="min-w-0">
                      {member.profilePublic === true ? (
                        <Link
                          href={`/shopper/profile/${member.userId}`}
                          className="font-semibold text-gray-900 dark:text-white hover:underline truncate block"
                        >
                          {shortDisplayName(member.name)}
                        </Link>
                      ) : (
                        <span className="font-semibold text-gray-900 dark:text-white truncate block">
                          {shortDisplayName(member.name)}
                        </span>
                      )}
                      <p className="text-sm text-gray-600 dark:text-gray-400">Grandmaster</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                      {member.guildXp.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Total XP</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyBox>
            No Grandmasters yet. Earn guild XP and rank up to be the first.{' '}
            <Link href="/shopper/ranks" className="text-amber-700 dark:text-amber-400 underline">
              See how ranks work
            </Link>
          </EmptyBox>
        )}
      </section>

      {/* Seasonal leaders */}
      <section aria-labelledby="hof-seasonal">
        <h2 id="hof-seasonal" className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6">
          <span aria-hidden="true">🏆 </span>This Season&apos;s Leaders
        </h2>

        {seasonal.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px]">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-gray-800">
                  <th scope="col" className="text-left py-3 px-3 sm:px-4 font-semibold text-gray-900 dark:text-white">
                    Place
                  </th>
                  <th scope="col" className="text-left py-3 px-3 sm:px-4 font-semibold text-gray-900 dark:text-white">
                    Name
                  </th>
                  <th scope="col" className="text-center py-3 px-3 sm:px-4 font-semibold text-gray-900 dark:text-white">
                    Rank
                  </th>
                  <th scope="col" className="text-right py-3 px-3 sm:px-4 font-semibold text-gray-900 dark:text-white">
                    XP
                  </th>
                </tr>
              </thead>
              <tbody>
                {seasonal.map((entry) => (
                  <tr
                    key={entry.userId}
                    className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-900 transition"
                  >
                    <td className="py-3 px-3 sm:px-4 text-lg font-bold text-gray-900 dark:text-white">{entry.rank}</td>
                    <td className="py-3 px-3 sm:px-4">
                      {entry.profilePublic === true ? (
                        <Link
                          href={`/shopper/profile/${entry.userId}`}
                          className="font-semibold text-gray-900 dark:text-white hover:underline"
                        >
                          {shortDisplayName(entry.name)}
                        </Link>
                      ) : (
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {shortDisplayName(entry.name)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-semibold text-white ${
                          RANK_STYLES[entry.explorerRank] || 'bg-gray-500'
                        }`}
                      >
                        {RANK_NAMES[entry.explorerRank] || entry.explorerRank}
                      </span>
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right font-semibold text-gray-900 dark:text-white">
                      {entry.guildXp.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyBox>
            No seasonal standings yet. They appear here once a season is underway. Keep earning XP and check back.
          </EmptyBox>
        )}
      </section>

      <p className="mt-10 text-center text-sm text-gray-600 dark:text-gray-400">
        Want to see the full picture?{' '}
        <Link href="/leaderboard" className="text-amber-700 dark:text-amber-400 underline">
          View the leaderboard
        </Link>
      </p>
    </PageShell>
  );
}
