import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import Skeleton from './Skeleton';

/**
 * Auto queue card (2026-10-21), embedded on pages/organizer/marketplace-extension.tsx.
 * One toggle per marketplace, backed by GET/PATCH /api/extension/auto-queue-settings
 * (Organizer.*AutoListEnabled). When on, GET /extension/autolist-queue returns newly published,
 * eligible items for that marketplace and the browser extension adds them to its posting queue.
 * The organizer still opens the marketplace tab to post. Vinted has no auto queue.
 *
 * Types are local on purpose (a @findasale/shared import breaks the Vercel build).
 */

type Platform = 'FACEBOOK' | 'CRAIGSLIST' | 'POSHMARK' | 'MERCARI' | 'GRAILED' | 'GUMTREE_AU';
type Settings = Record<Platform, boolean>;

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'FACEBOOK', label: 'Facebook Marketplace' },
  { key: 'CRAIGSLIST', label: 'Craigslist' },
  { key: 'POSHMARK', label: 'Poshmark' },
  { key: 'MERCARI', label: 'Mercari' },
  { key: 'GRAILED', label: 'Grailed' },
  { key: 'GUMTREE_AU', label: 'Gumtree Australia' },
];

const QUERY_KEY = ['auto-queue-settings'];

const AutoQueueCard: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<Settings>({
    queryKey: QUERY_KEY,
    queryFn: async () => (await api.get('/extension/auto-queue-settings')).data.settings as Settings,
    staleTime: 30 * 1000,
  });

  const toggle = useMutation({
    mutationFn: async (vars: { key: Platform; value: boolean }) =>
      (await api.patch('/extension/auto-queue-settings', { settings: { [vars.key]: vars.value } })).data.settings as Settings,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<Settings>(QUERY_KEY);
      if (previous) queryClient.setQueryData<Settings>(QUERY_KEY, { ...previous, [vars.key]: vars.value });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSuccess: (next) => queryClient.setQueryData(QUERY_KEY, next),
  });

  return (
    <div className="border-t border-warm-200 dark:border-gray-700 pt-6 mt-6" id="auto-queue">
      <h3 className="text-sm font-semibold text-warm-700 dark:text-gray-300 mb-3">Auto queue</h3>

      <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
        <p className="text-sm text-warm-600 dark:text-gray-400 mb-4 leading-relaxed">
          When an eligible item is published, add it to this marketplace&apos;s posting queue in the
          extension. You still open the marketplace tab to post. Items a marketplace does not accept
          (for example local pickup only items on Mercari and Poshmark) are never queued.
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
              const on = data[key] === true;
              const id = 'auto-queue-' + key.toLowerCase();
              return (
                <li key={key} className="flex items-center justify-between gap-4 py-3">
                  <label htmlFor={id} className="text-sm font-medium text-warm-900 dark:text-gray-100">
                    {label}
                  </label>
                  <button
                    id={id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggle.mutate({ key, value: !on })}
                    className={
                      'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ' +
                      (on ? 'bg-amber-600' : 'bg-warm-300 dark:bg-gray-600')
                    }
                  >
                    <span className="sr-only">Auto queue for {label}</span>
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
      </div>
    </div>
  );
};

export default AutoQueueCard;
