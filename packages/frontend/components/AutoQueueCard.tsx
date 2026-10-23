import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import Skeleton from './Skeleton';

/**
 * Auto queue card (2026-10-21), embedded on pages/organizer/marketplace-extension.tsx.
 * One toggle per marketplace, backed by GET/PATCH /api/organizers/me/auto-queue-settings (cookie session + CSRF;
 * moved 2026-10-23 off the Bearer-only /api/extension router, where every toggle save got 401 BEARER_REQUIRED).
 * When on, GET /extension/autolist-queue returns newly published, eligible items for that marketplace and the
 * browser extension adds them to its posting queue. The organizer still opens the marketplace tab to post.
 * Vinted has no auto queue.
 *
 * 2026-10-23: also shows when a marketplace is paused (Organizer.pausedMarketplaces, set in the extension), since a
 * paused marketplace never gets a queue even with its toggle on, and holds the optional test limits (most new
 * listings per check, only these items) used for a supervised few-item live test.
 *
 * Types are local on purpose (a @findasale/shared import breaks the Vercel build).
 */

type Platform = 'FACEBOOK' | 'CRAIGSLIST' | 'POSHMARK' | 'MERCARI' | 'GRAILED' | 'GUMTREE_AU';
type Settings = Record<Platform, boolean>;
type Limits = { maxNewPerRun: number | null; onlyItemIds: string[] };
type AutoQueueData = { settings: Settings; paused: string[]; limits: Limits; limitsAvailable: boolean };

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'FACEBOOK', label: 'Facebook Marketplace' },
  { key: 'CRAIGSLIST', label: 'Craigslist' },
  { key: 'POSHMARK', label: 'Poshmark' },
  { key: 'MERCARI', label: 'Mercari' },
  { key: 'GRAILED', label: 'Grailed' },
  { key: 'GUMTREE_AU', label: 'Gumtree Australia' },
];

const QUERY_KEY = ['auto-queue-settings'];
const ENDPOINT = '/organizers/me/auto-queue-settings';

const toData = (d: any): AutoQueueData => ({
  settings: (d?.settings || {}) as Settings,
  paused: Array.isArray(d?.paused) ? d.paused : [],
  limits: {
    maxNewPerRun: typeof d?.limits?.maxNewPerRun === 'number' ? d.limits.maxNewPerRun : null,
    onlyItemIds: Array.isArray(d?.limits?.onlyItemIds) ? d.limits.onlyItemIds : [],
  },
  limitsAvailable: d?.limitsAvailable !== false,
});

const AutoQueueCard: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<AutoQueueData>({
    queryKey: QUERY_KEY,
    queryFn: async () => toData((await api.get(ENDPOINT)).data),
    staleTime: 30 * 1000,
  });

  const toggle = useMutation({
    mutationFn: async (vars: { key: Platform; value: boolean }) =>
      toData((await api.patch(ENDPOINT, { settings: { [vars.key]: vars.value } })).data),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<AutoQueueData>(QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<AutoQueueData>(QUERY_KEY, {
          ...previous,
          settings: { ...previous.settings, [vars.key]: vars.value },
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSuccess: (next) => queryClient.setQueryData(QUERY_KEY, next),
  });

  // Test limits form (local draft, saved with the button).
  const [maxDraft, setMaxDraft] = useState('');
  const [idsDraft, setIdsDraft] = useState('');
  const [limitError, setLimitError] = useState('');
  useEffect(() => {
    if (!data) return;
    setMaxDraft(data.limits.maxNewPerRun != null ? String(data.limits.maxNewPerRun) : '');
    setIdsDraft(data.limits.onlyItemIds.join('\n'));
  }, [data?.limits.maxNewPerRun, data?.limits.onlyItemIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveLimits = useMutation({
    mutationFn: async (limits: Limits) => toData((await api.patch(ENDPOINT, { limits })).data),
    onSuccess: (next) => {
      setLimitError('');
      queryClient.setQueryData(QUERY_KEY, next);
    },
    onError: (err: any) => setLimitError(err?.response?.data?.message || 'Those limits did not save. Try again.'),
  });

  const submitLimits = (clear: boolean) => {
    if (clear) {
      saveLimits.mutate({ maxNewPerRun: null, onlyItemIds: [] });
      return;
    }
    const trimmed = maxDraft.trim();
    let max: number | null = null;
    if (trimmed) {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        setLimitError('Most new listings per check must be a whole number from 1 to 500, or left blank.');
        return;
      }
      max = n;
    }
    const ids = Array.from(new Set(idsDraft.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)));
    saveLimits.mutate({ maxNewPerRun: max, onlyItemIds: ids });
  };

  const limitsOn = !!data && (data.limits.maxNewPerRun != null || data.limits.onlyItemIds.length > 0);

  return (
    <div className="border-t border-warm-200 dark:border-gray-700 pt-6 mt-6" id="auto-queue">
      <h3 className="text-sm font-semibold text-warm-700 dark:text-gray-300 mb-3">Auto queue</h3>

      <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
        <p className="text-sm text-warm-600 dark:text-gray-400 mb-4 leading-relaxed">
          When an eligible item is published, add it to this marketplace&apos;s posting queue in the
          extension. You still open the marketplace tab to post. Items a marketplace does not accept
          (for example local pickup only items on Mercari and Poshmark) are never queued.
        </p>
        <p className="text-sm text-warm-600 dark:text-gray-400 mb-4 leading-relaxed">
          <span className="font-semibold text-warm-900 dark:text-gray-100">Vinted: saves a draft for you to post.</span>{' '}
          Vinted has no auto queue. The extension fills one listing at a time and saves it as a Vinted draft; it never
          posts on Vinted for you.
        </p>

        {isLoading && <Skeleton className="h-24 w-full" />}

        {!isLoading && isError && (
          <div className="text-sm">
            <p className="text-warm-900 dark:text-gray-100 font-medium mb-2">
              We couldn&apos;t load your auto queue settings.
            </p>
            <button type="button" onClick={() => refetch()} className="text-amber-600 hover:underline font-medium">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && data && (
          <ul className="divide-y divide-warm-200 dark:divide-gray-700">
            {PLATFORMS.map(({ key, label }) => {
              const on = data.settings[key] === true;
              const paused = data.paused.includes(key);
              const id = 'auto-queue-' + key.toLowerCase();
              return (
                <li key={key} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <label htmlFor={id} className="text-sm font-medium text-warm-900 dark:text-gray-100">
                      {label}
                    </label>
                    {paused && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                        Paused
                      </span>
                    )}
                    {paused && (
                      <p className="text-xs text-warm-600 dark:text-gray-400 mt-1">
                        Paused in the extension. Nothing is queued for this marketplace until you resume it there
                        {on ? ', even with auto queue on.' : '.'}
                      </p>
                    )}
                  </div>
                  <button
                    id={id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggle.mutate({ key, value: !on })}
                    className={
                      'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ' +
                      (on ? (paused ? 'bg-amber-300 dark:bg-amber-800' : 'bg-amber-600') : 'bg-warm-300 dark:bg-gray-600')
                    }
                  >
                    <span className="sr-only">Auto queue for {label}{paused ? ' (paused)' : ''}</span>
                    <span
                      className={
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform ' +
                        (on ? 'translate-x-6' : 'translate-x-1')
                      }
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {toggle.isError && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-3" role="alert">
            That change did not save. Try again.
          </p>
        )}

        {!isLoading && !isError && data && (
          <div className="mt-6 pt-4 border-t border-warm-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-warm-900 dark:text-gray-100">
              Test limits <span className="font-normal text-warm-600 dark:text-gray-400">(optional)</span>
            </h4>
            <p className="text-xs text-warm-600 dark:text-gray-400 mt-1 mb-3 leading-relaxed">
              Use these to try the auto queue on a few items first. Leave both empty for no limit.
              {limitsOn && <span className="font-semibold text-amber-700 dark:text-amber-300"> Limits are on.</span>}
            </p>
            {!data.limitsAvailable ? (
              <p className="text-sm text-warm-600 dark:text-gray-400">Test limits are not available yet.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label htmlFor="auto-queue-max" className="block text-sm font-medium text-warm-900 dark:text-gray-100 mb-1">
                    Most new listings per check
                  </label>
                  <input
                    id="auto-queue-max"
                    type="number"
                    min={1}
                    max={500}
                    inputMode="numeric"
                    placeholder="No limit"
                    value={maxDraft}
                    onChange={(e) => setMaxDraft(e.target.value)}
                    className="w-32 rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-warm-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label htmlFor="auto-queue-ids" className="block text-sm font-medium text-warm-900 dark:text-gray-100 mb-1">
                    Only these items
                  </label>
                  <textarea
                    id="auto-queue-ids"
                    rows={3}
                    placeholder="Item IDs, one per line (the ID is the last part of the item's page address)"
                    value={idsDraft}
                    onChange={(e) => setIdsDraft(e.target.value)}
                    className="w-full rounded-md border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono text-warm-900 dark:text-gray-100"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={saveLimits.isPending}
                    onClick={() => submitLimits(false)}
                    className="rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Save limits
                  </button>
                  {limitsOn && (
                    <button
                      type="button"
                      disabled={saveLimits.isPending}
                      onClick={() => submitLimits(true)}
                      className="rounded-md border border-warm-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-warm-800 dark:text-gray-200"
                    >
                      Remove limits
                    </button>
                  )}
                </div>
                {limitError && (
                  <p className="text-sm text-red-600 dark:text-red-400" role="alert">{limitError}</p>
                )}
                {saveLimits.isSuccess && !limitError && (
                  <p className="text-sm text-green-700 dark:text-green-400" role="status">Saved.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoQueueCard;
