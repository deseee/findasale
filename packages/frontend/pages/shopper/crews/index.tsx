/**
 * /shopper/crews - Crews hub
 * Tabs: My Crews / Browse Crews / Create. Browse is public; My Crews and Create need sign-in.
 */

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import CrewCard from '../../../components/crews/CrewCard';
import CreateCrewForm from '../../../components/crews/CreateCrewForm';
import {
  useBrowseCrews,
  useMyCrews,
  useJoinCrew,
  crewErrorMessage,
} from '../../../hooks/useCrews';

type TabId = 'my' | 'browse' | 'create';
const TABS: { id: TabId; label: string }[] = [
  { id: 'my', label: 'My Crews' },
  { id: 'browse', label: 'Browse Crews' },
  { id: 'create', label: 'Create' },
];

function isTab(v: unknown): v is TabId {
  return v === 'my' || v === 'browse' || v === 'create';
}

const CrewsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  // Tab lives in the URL (?tab=) so it can be linked to and survives refresh.
  const queryTab = router.query.tab;
  const tab: TabId = isTab(queryTab) ? queryTab : user ? 'my' : 'browse';
  const setTab = (next: TabId) => {
    router.replace({ pathname: '/shopper/crews', query: { tab: next } }, undefined, { shallow: true });
  };

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search so we do not query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const mine = useMyCrews(!!user);
  const browse = useBrowseCrews(page, search);
  const joinCrew = useJoinCrew();
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const limits = mine.data?.limits;
  const atLimit = !!limits && mine.data!.crews.length >= limits.maxCrewsPerUser;
  const maxMembers = browse.data?.maxMembers ?? limits?.maxMembers ?? 50;

  const handleJoin = async (crewId: string) => {
    if (!user) {
      router.push('/login?redirect=/shopper/crews%3Ftab%3Dbrowse');
      return;
    }
    setJoiningId(crewId);
    try {
      await joinCrew.mutateAsync(crewId);
      showToast('You joined the crew.', 'success');
    } catch (err) {
      showToast(crewErrorMessage(err, 'Could not join this crew.'), 'error');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <>
      <Head>
        <title>Crews | FindA.Sale</title>
        <meta
          name="description"
          content="Join a crew of fellow shoppers, climb the crew leaderboard and see what your crew is finding. Crews are public, up to 50 members, and free to join."
        />
      </Head>

      <main className="bg-warm-50 dark:bg-gray-900 min-h-screen py-8 md:py-12">
        <div className="max-w-4xl mx-auto px-4">
          <header className="mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-warm-900 dark:text-warm-100 font-fraunces">Crews</h1>
            <p className="mt-2 text-warm-700 dark:text-warm-300">
              A crew is a public group of up to {maxMembers} shoppers with its own leaderboard and a feed of
              members' photos. Joining is free and instant. You can be in up to {limits?.maxCrewsPerUser ?? 3} crews.{' '}
              <Link href="/guides/crews" className="text-purple-700 dark:text-purple-300 underline">
                How crews work
              </Link>
            </p>
          </header>

          {/* Tabs */}
          <div role="tablist" aria-label="Crews sections" className="flex gap-1 border-b border-warm-200 dark:border-gray-700 mb-6 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`crews-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`crews-panel-${t.id}`}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[44px] whitespace-nowrap px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  tab === t.id
                    ? 'border-purple-600 text-purple-700 dark:text-purple-300 dark:border-purple-400'
                    : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* My Crews */}
          {tab === 'my' && (
            <section role="tabpanel" id="crews-panel-my" aria-labelledby="crews-tab-my">
              {authLoading || (user && mine.isLoading) ? (
                <p className="text-warm-600 dark:text-warm-400">Loading your crews...</p>
              ) : !user ? (
                <div className="rounded-lg bg-white dark:bg-gray-800 p-6 text-center shadow-sm">
                  <p className="text-warm-700 dark:text-warm-300 mb-4">Sign in to see the crews you belong to.</p>
                  <Link
                    href="/login?redirect=/shopper/crews"
                    className="inline-flex min-h-[44px] items-center px-5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                  >
                    Sign in
                  </Link>
                </div>
              ) : mine.isError ? (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-red-800 dark:text-red-200">
                  <p className="mb-3">We could not load your crews.</p>
                  <button
                    type="button"
                    onClick={() => mine.refetch()}
                    className="min-h-[44px] px-4 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
                  >
                    Try again
                  </button>
                </div>
              ) : mine.data && mine.data.crews.length > 0 ? (
                <>
                  <p className="mb-3 text-sm text-warm-600 dark:text-warm-400">
                    You are in {mine.data.crews.length} of {mine.data.limits.maxCrewsPerUser} crews.
                  </p>
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {mine.data.crews.map((c) => (
                      <CrewCard
                        key={c.id}
                        crew={c}
                        maxMembers={mine.data!.limits.maxMembers}
                        roleLabel={c.role === 'FOUNDER' ? 'Founder' : undefined}
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <div className="rounded-lg bg-white dark:bg-gray-800 p-8 text-center shadow-sm">
                  <p className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">You are not in a crew yet</p>
                  <p className="text-warm-700 dark:text-warm-300 mb-5">
                    Join one for free, or start your own for {(mine.data?.limits.creationCost ?? 500).toLocaleString()} XP.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      type="button"
                      onClick={() => setTab('browse')}
                      className="min-h-[44px] px-5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                    >
                      Browse crews
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('create')}
                      className="min-h-[44px] px-5 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-900 dark:text-warm-100 font-semibold hover:bg-warm-100 dark:hover:bg-gray-700"
                    >
                      Create a crew
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Browse */}
          {tab === 'browse' && (
            <section role="tabpanel" id="crews-panel-browse" aria-labelledby="crews-tab-browse">
              <div className="mb-4">
                <label htmlFor="crew-search" className="sr-only">
                  Search crews by name
                </label>
                <input
                  id="crew-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  maxLength={50}
                  placeholder="Search crews by name"
                  className="w-full min-h-[44px] rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {browse.isLoading ? (
                <p className="text-warm-600 dark:text-warm-400">Loading crews...</p>
              ) : browse.isError ? (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-red-800 dark:text-red-200">
                  <p className="mb-3">We could not load crews.</p>
                  <button
                    type="button"
                    onClick={() => browse.refetch()}
                    className="min-h-[44px] px-4 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
                  >
                    Try again
                  </button>
                </div>
              ) : browse.data && browse.data.crews.length > 0 ? (
                <>
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {browse.data.crews.map((c) => (
                      <CrewCard
                        key={c.id}
                        crew={c}
                        maxMembers={browse.data!.maxMembers}
                        onJoin={handleJoin}
                        joining={joiningId === c.id}
                        canJoin={!atLimit}
                        joinHint={atLimit ? `You are in ${limits?.maxCrewsPerUser} crews already. Leave one to join another.` : undefined}
                      />
                    ))}
                  </ul>

                  {browse.data.totalPages > 1 && (
                    <nav aria-label="Crew pages" className="mt-6 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="min-h-[44px] px-4 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-900 dark:text-warm-100 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <p className="text-sm text-warm-600 dark:text-warm-400">
                        Page {browse.data.page} of {browse.data.totalPages}
                      </p>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(browse.data!.totalPages, p + 1))}
                        disabled={page >= browse.data.totalPages}
                        className="min-h-[44px] px-4 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-900 dark:text-warm-100 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </nav>
                  )}
                </>
              ) : (
                <div className="rounded-lg bg-white dark:bg-gray-800 p-8 text-center shadow-sm">
                  <p className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
                    {search ? `No crews match "${search}"` : 'No crews yet'}
                  </p>
                  <p className="text-warm-700 dark:text-warm-300 mb-5">
                    {search ? 'Try a different name, or start that crew yourself.' : 'Be the first to start one.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('create')}
                    className="min-h-[44px] px-5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                  >
                    Create a crew
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Create */}
          {tab === 'create' && (
            <section role="tabpanel" id="crews-panel-create" aria-labelledby="crews-tab-create">
              <CreateCrewForm />
            </section>
          )}
        </div>
      </main>
    </>
  );
};

export default CrewsPage;
