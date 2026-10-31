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
 * 2026-10-26: also shows when the extension last checked in, a red notice when auto queue is on but the extension has
 * been silent for 24h+ (usually a signed-out Chrome), and the items held back from Poshmark because Poshmark flagged
 * them (30-day hold, by design). Data: the `extension` block of the same GET.
 *
 * 1.0.67 (2026-10-26): "Try again on Poshmark" per held item and "Try all again" release a hold
 * (POST .../auto-queue-settings/release-holds). The extension drops the hold on its next check and offers the item to
 * Poshmark again; if Poshmark flags it again, it is held again the same way.
 *
 * 1.0.71 (2026-10-27, Patrick): the 1.0.69 certify buttons for oversized holds are gone. The extension never clicks
 * Publish Listing in Poshmark's flag box; for an oversized hold the card tells the organizer to click it themselves.
 *
 * 2026-10-30 (Patrick did not see "Try again on Poshmark" for 3 held Neo Geo carts and re-selected them by hand): the
 * buttons were in the page text but easy to miss. The held list sat at the bottom of a long install page, inside this
 * card after the toggles, and each "Try again on Poshmark" was a small text link. Now: HeldBackNotice (exported below)
 * puts an amber notice near the top of the page with a jump link, the held list is an amber callout, both buttons are
 * full-size buttons (44px tap targets), each row stacks on phones, and a #auto-queue-held link scrolls to the list
 * once it has loaded. useAutoQueueData shares the card's query, so the notice adds no extra request.
 *
 * Types are local on purpose (a @findasale/shared import breaks the Vercel build).
 */

type Platform = 'FACEBOOK' | 'CRAIGSLIST' | 'POSHMARK' | 'MERCARI' | 'GRAILED' | 'GUMTREE_AU';
type Settings = Record<Platform, boolean>;
type Limits = { maxNewPerRun: number | null; onlyItemIds: string[] };
type HeldItem = { itemId: string; title: string; kind: string; at: string; platform: string };
type ReleasePending = { itemId: string; title: string; at: string };
type ExtensionStatus = { lastPollAt: string | null; stale: boolean; neverSeen: boolean; heldFlagged: HeldItem[]; releasePending: ReleasePending[] };
// 2026-10-27: Mercari's active-listing cap as the server counts it (null when it could not be counted).
type MercariCapacity = { cap: number; live: number; free: number; atLimit: boolean; note: string | null };
type AutoQueueData = { settings: Settings; paused: string[]; limits: Limits; limitsAvailable: boolean; extension: ExtensionStatus; mercari: MercariCapacity | null };

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
  extension: {
    lastPollAt: typeof d?.extension?.lastPollAt === 'string' ? d.extension.lastPollAt : null,
    stale: d?.extension?.stale === true,
    neverSeen: d?.extension?.neverSeen === true,
    heldFlagged: Array.isArray(d?.extension?.heldFlagged) ? d.extension.heldFlagged : [],
    releasePending: Array.isArray(d?.extension?.releasePending) ? d.extension.releasePending : [],
  },
  mercari:
    d?.mercari && typeof d.mercari.cap === 'number' && typeof d.mercari.live === 'number'
      ? {
          cap: d.mercari.cap,
          live: d.mercari.live,
          free: typeof d.mercari.free === 'number' ? d.mercari.free : Math.max(d.mercari.cap - d.mercari.live, 0),
          atLimit: d.mercari.atLimit === true,
          note: typeof d.mercari.note === 'string' ? d.mercari.note : null,
        }
      : null,
});

// 2026-10-26: when the extension last checked in, as "Oct 26, 3:58 PM". Empty string when unknown.
const formatWhen = (iso: string | null): string => {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const HELD_KIND_LABEL: Record<string, string> = {
  oversized: 'Poshmark flagged it as possibly oversized',
  prohibited: 'Poshmark flagged it as possibly prohibited',
  edit: 'Poshmark needs you to confirm this edit',
};

// 2026-10-30: the card and HeldBackNotice share this query (same key), so the page makes one request.
export const useAutoQueueData = () =>
  useQuery<AutoQueueData>({
    queryKey: QUERY_KEY,
    queryFn: async () => toData((await api.get(ENDPOINT)).data),
    staleTime: 30 * 1000,
  });

const HELD_ANCHOR = 'auto-queue-held';
const heldNotEdit = (d: AutoQueueData | undefined): HeldItem[] =>
  d ? d.extension.heldFlagged.filter((h) => h.kind !== 'edit') : [];
const scrollToHeld = () => {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(HELD_ANCHOR);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/**
 * 2026-10-30: amber notice for the top of pages/organizer/marketplace-extension.tsx when items are held back from
 * Poshmark, with a link that jumps to the held list in the Auto queue card. Renders nothing otherwise.
 */
export const HeldBackNotice: React.FC = () => {
  const { data } = useAutoQueueData();
  const held = heldNotEdit(data);
  if (!held.length) return null;
  return (
    <div
      className="mb-8 rounded-lg border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-4 text-sm text-warm-900 dark:text-amber-50"
      role="status"
      data-testid="held-back-notice"
    >
      <p className="font-semibold">
        {held.length === 1 ? '1 item is' : held.length + ' items are'} held back from Poshmark.
      </p>
      <p className="mt-1 text-warm-700 dark:text-amber-100">
        Poshmark flagged {held.length === 1 ? 'it' : 'them'}, so the auto queue is not offering{' '}
        {held.length === 1 ? 'it' : 'them'} to Poshmark. You can send {held.length === 1 ? 'it' : 'them'} to Poshmark again.
      </p>
      <a
        href={'#' + HELD_ANCHOR}
        onClick={(e) => {
          e.preventDefault();
          scrollToHeld();
          if (typeof window !== 'undefined') window.history.replaceState(null, '', '#' + HELD_ANCHOR);
        }}
        className="mt-3 inline-flex min-h-[44px] items-center rounded-md bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-semibold text-white"
      >
        Review and try again on Poshmark
      </a>
    </div>
  );
};

const AutoQueueCard: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useAutoQueueData();

  // 2026-10-30: a #auto-queue-held link (the notice above, or a shared link) lands on the held list once it exists.
  // The browser's own hash jump runs before this data loads, when the list is not on the page yet.
  const heldCount = heldNotEdit(data).length;
  useEffect(() => {
    if (!heldCount || typeof window === 'undefined') return;
    if (window.location.hash === '#' + HELD_ANCHOR) scrollToHeld();
  }, [heldCount]);

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

  // 1.0.67: release Poshmark-flag holds so the extension offers those items to Poshmark again on its next check.
  const [releaseError, setReleaseError] = useState('');
  const releaseHolds = useMutation({
    mutationFn: async (body: { itemIds: string[] } | { all: true }) =>
      toData((await api.post(ENDPOINT + '/release-holds', body)).data),
    onSuccess: (next) => {
      setReleaseError('');
      queryClient.setQueryData(QUERY_KEY, next);
    },
    onError: (err: any) => setReleaseError(err?.response?.data?.message || 'That did not save. Try again.'),
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

        {!isLoading && !isError && data && data.extension.stale && (
          <div
            className="mb-4 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-900 dark:text-red-100"
            role="alert"
            id="auto-queue-extension-silent"
          >
            {data.extension.neverSeen ? (
              <>
                <p className="font-semibold">The browser extension has not checked in yet.</p>
                <p className="mt-1">
                  Auto queue only works while the FindA.Sale extension is installed in Chrome and you are signed in at
                  finda.sale in that same Chrome.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">
                  The browser extension has not checked in since {formatWhen(data.extension.lastPollAt)}.
                </p>
                <p className="mt-1">
                  Nothing new is being queued or posted. This usually means Chrome was signed out of finda.sale. Open
                  Chrome, sign in at finda.sale, and the extension picks up again on its own.
                </p>
              </>
            )}
          </div>
        )}

        {!isLoading && !isError && data && !data.extension.stale && data.extension.lastPollAt && (
          <p className="mb-4 text-xs text-warm-600 dark:text-gray-400">
            Extension last checked in {formatWhen(data.extension.lastPollAt)}.
          </p>
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

        {!isLoading && !isError && data && data.mercari && data.settings.MERCARI && (
          <p className="mt-3 text-xs text-warm-600 dark:text-gray-400" data-testid="auto-queue-mercari-cap">
            {data.mercari.atLimit && data.mercari.note
              ? data.mercari.note
              : `Mercari: ${data.mercari.live} of ${data.mercari.cap} listings live. The auto queue adds at most ${data.mercari.free} more, items that just sold there first.`}
          </p>
        )}

        {!isLoading && !isError && data && data.extension.heldFlagged.some((h) => h.kind === 'edit') && (
          <div className="mt-6 pt-4 border-t border-warm-200 dark:border-gray-700" id="auto-queue-edit-confirm">
            <h4 className="text-sm font-semibold text-warm-900 dark:text-gray-100">
              Poshmark needs you to confirm this edit ({data.extension.heldFlagged.filter((h) => h.kind === 'edit').length})
            </h4>
            <p className="text-xs text-warm-600 dark:text-gray-400 mt-1 mb-3 leading-relaxed">
              Poshmark flagged the price change on these live listings and would not take it, even through its own Edit
              Listing form. The extension does not retry them or confirm the flag for you. Open the listing on Poshmark and
              change the price there if you are sure, or change the price here again to try a new edit.
            </p>
            <ul className="divide-y divide-warm-200 dark:divide-gray-700">
              {data.extension.heldFlagged.filter((h) => h.kind === 'edit').map((h) => (
                <li key={h.itemId} className="py-2 text-sm">
                  <span className="font-medium text-warm-900 dark:text-gray-100">{h.title}</span>
                  <span className="block text-xs text-warm-600 dark:text-gray-400">
                    {HELD_KIND_LABEL.edit}
                    {formatWhen(h.at) ? ' on ' + formatWhen(h.at) : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isLoading && !isError && data && heldCount > 0 && (
          <div
            className="mt-6 scroll-mt-24 rounded-lg border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-4"
            id={HELD_ANCHOR}
            data-testid="auto-queue-held"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-warm-900 dark:text-gray-100">
                Held back from Poshmark ({heldCount})
              </h4>
              <button
                type="button"
                onClick={() => releaseHolds.mutate({ all: true })}
                disabled={releaseHolds.isPending}
                className="inline-flex min-h-[44px] items-center rounded-md bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {releaseHolds.isPending ? 'Saving...' : 'Try all again'}
              </button>
            </div>
            <p className="text-sm text-warm-700 dark:text-gray-300 mt-2 mb-3 leading-relaxed">
              Poshmark&apos;s own listing check flagged these items, so the auto queue does not offer them to Poshmark
              again for 30 days from the flag. Other marketplaces are not affected. If an item is fine for Poshmark, use
              Try again and the extension offers it to Poshmark on its next check. If Poshmark flags it again, the
              extension leaves that tab open for you to decide, and holds it again if you skip it.
            </p>
            {data.extension.heldFlagged.some((h) => h.kind === 'oversized') && (
              <p className="text-sm text-warm-700 dark:text-gray-300 mb-3 leading-relaxed">
                Poshmark flagged these as possibly oversized. Its box still says 10 lb max, but its labels now go past
                15 lb and the seller pays for heavier ones out of earnings: $5 for 5-10 lb, $10 for 10-15 lb, $15 for
                15-25 lb, and the full shipping cost over 25 lb. If the package is under 108 inches (length plus girth)
                and that cost is fine, open Poshmark and click Publish Listing yourself when Poshmark asks.
              </p>
            )}
            {releaseError && (
              <p className="text-sm text-red-700 dark:text-red-300 mb-2" role="alert">{releaseError}</p>
            )}
            <ul className="divide-y divide-amber-200 dark:divide-amber-800/60">
              {heldNotEdit(data).map((h) => (
                <li key={h.itemId} className="py-3 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-warm-900 dark:text-gray-100 break-words">{h.title}</span>
                    <span className="block text-xs text-warm-600 dark:text-gray-400">
                      {HELD_KIND_LABEL[h.kind] || 'Poshmark flagged it'}
                      {formatWhen(h.at) ? ' on ' + formatWhen(h.at) : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => releaseHolds.mutate({ itemIds: [h.itemId] })}
                    disabled={releaseHolds.isPending}
                    aria-label={'Try again on Poshmark: ' + h.title}
                    className="shrink-0 self-start sm:self-auto inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-amber-600 bg-white dark:bg-gray-900 hover:bg-amber-100 dark:hover:bg-gray-800 px-4 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200 disabled:opacity-60"
                  >
                    Try again on Poshmark
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isLoading && !isError && data && data.extension.releasePending.length > 0 && (
          <div className="mt-4 rounded-md border border-warm-200 dark:border-gray-700 p-3" id="auto-queue-release-pending">
            <p className="text-xs text-warm-700 dark:text-gray-300 leading-relaxed">
              Trying again on Poshmark at the extension&apos;s next check ({data.extension.releasePending.length}):{' '}
              {data.extension.releasePending.map((r) => r.title).join(', ')}
            </p>
          </div>
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
