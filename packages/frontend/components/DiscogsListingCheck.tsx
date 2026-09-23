/**
 * DiscogsListingCheck (ADR-132 section 6.1 / 11.2)
 *
 * "Check my Discogs listings": runs the organizer's own rematch sweep as a DRY RUN
 * (POST /api/discogs/match/sweep { dryRun: true }) one page at a time and shows what each
 * live listing is on versus what we would suggest. Read-only by design: there is no bulk
 * apply. Each row links to the item editor, where the organizer confirms the release and
 * fixes the listing one item at a time.
 */
import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import {
  DiscogsSweepClassification,
  DiscogsSweepReport,
  DiscogsSweepRow,
  discogsErrorMessage,
  discogsReleaseUrl,
  formatClassLabel,
} from '../types/discogsMatch';

const PAGE_SIZE = 10;

const CLASS_META: Record<DiscogsSweepClassification, { label: string; cls: string }> = {
  AGREE: { label: 'Looks right', cls: 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200' },
  CONFIRMED_AGREE: { label: 'Confirmed', cls: 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200' },
  MISMATCH: { label: 'Different release', cls: 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200' },
  CONFIRMED_MISMATCH: { label: 'Listing needs fixing', cls: 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200' },
  NEEDS_SELECTION: { label: 'Needs your pick', cls: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200' },
  NOT_IN_DISCOGS: { label: 'Not in Discogs', cls: 'bg-warm-200 dark:bg-gray-700 text-warm-800 dark:text-gray-200' },
  LISTING_GONE: { label: 'Listing gone from Discogs', cls: 'bg-warm-200 dark:bg-gray-700 text-warm-800 dark:text-gray-200' },
  ERROR: { label: 'Couldn\'t check', cls: 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200' },
};

const VETO_LABEL: Record<string, string> = {
  format: 'different format',
  script: 'different language edition',
  artist: 'different artist',
  title: 'different title',
};

type ReleaseLike = { releaseId: number; artist: string; title: string; formatClass: string | null };

const ReleaseText: React.FC<{ release: ReleaseLike | null; empty: string; vetoes?: string[] }> = ({ release, empty, vetoes }) => {
  if (!release) return <span className="text-warm-500 dark:text-gray-400">{empty}</span>;
  const fmt = formatClassLabel(release.formatClass);
  return (
    <span className="block min-w-0">
      <a
        href={discogsReleaseUrl(release.releaseId)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 underline break-words"
      >
        {release.artist ? `${release.artist} - ${release.title}` : release.title}
      </a>
      {fmt && <span className="text-warm-500 dark:text-gray-400"> ({fmt})</span>}
      {vetoes && vetoes.length > 0 && (
        <span className="block text-xs text-red-700 dark:text-red-300">
          Looks like a {vetoes.map((v) => VETO_LABEL[v] ?? v).join(', ')}
        </span>
      )}
    </span>
  );
};

const suggestedRelease = (row: DiscogsSweepRow): { release: ReleaseLike | null; note: string | null } => {
  const p = row.proposed;
  if (!p) return { release: null, note: null };
  if (p.releaseId) {
    const c = p.candidates.find((x) => x.releaseId === p.releaseId) ?? null;
    return { release: c, note: p.draftOnly ? 'Pressing not confirmed' : null };
  }
  if (p.candidates.length > 0) return { release: p.candidates[0], note: 'Closest result, needs your pick' };
  return { release: null, note: null };
};

const StatusChip: React.FC<{ row: DiscogsSweepRow }> = ({ row }) => {
  const meta = CLASS_META[row.classification] ?? CLASS_META.ERROR;
  return (
    <span>
      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap ${meta.cls}`}>{meta.label}</span>
      {row.listingStatus && (
        <span className="block text-xs text-warm-500 dark:text-gray-400 mt-0.5">On Discogs: {row.listingStatus}</span>
      )}
      {row.error && <span className="block text-xs text-red-700 dark:text-red-300 mt-0.5 break-words">{row.error}</span>}
    </span>
  );
};

const DiscogsListingCheck: React.FC = () => {
  const [rows, setRows] = useState<DiscogsSweepRow[]>([]);
  const [report, setReport] = useState<DiscogsSweepReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const sweep = useMutation({
    mutationFn: async (offset: number) => {
      const res = await api.post('/discogs/match/sweep', { dryRun: true, limit: PAGE_SIZE, offset });
      return res.data as DiscogsSweepReport;
    },
    onSuccess: (data, offset) => {
      setErrorMsg(null);
      setReport(data);
      setRows((prev) => (offset === 0 ? data.rows : [...prev, ...data.rows]));
    },
    onError: (err: any) => setErrorMsg(discogsErrorMessage(err, 'Couldn\'t check your Discogs listings. Try again in a few minutes.')),
  });

  const problemClasses: DiscogsSweepClassification[] = ['MISMATCH', 'CONFIRMED_MISMATCH', 'NEEDS_SELECTION', 'ERROR'];
  const visibleRows = onlyProblems ? rows.filter((r) => problemClasses.includes(r.classification)) : rows;
  const problemCount = rows.filter((r) => problemClasses.includes(r.classification)).length;
  const checkedCount = rows.length;
  const total = report?.total ?? 0;

  return (
    <div className="pt-4 border-t border-warm-200 dark:border-gray-700 space-y-3">
      <div>
        <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100">Check my Discogs listings</h3>
        <p className="mt-1 text-sm text-warm-600 dark:text-gray-400">
          Compares each of your live Discogs listings with the record details on FindA.Sale and flags any listed as the
          wrong pressing. This only looks. Nothing changes on Discogs or FindA.Sale. Checking takes about a second per
          record.
        </p>
      </div>

      {!report && (
        <button
          type="button"
          onClick={() => sweep.mutate(0)}
          disabled={sweep.isPending}
          className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 text-sm"
        >
          {sweep.isPending ? 'Checking listings...' : 'Check my Discogs listings'}
        </button>
      )}

      {errorMsg && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{errorMsg}</p>
        </div>
      )}

      {report && total === 0 && (
        <p className="text-sm text-warm-600 dark:text-gray-400">
          You don&apos;t have any items listed on Discogs from FindA.Sale yet, so there&apos;s nothing to check.
        </p>
      )}

      {report && total > 0 && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm text-warm-700 dark:text-gray-300">
              Checked {checkedCount} of {total} listing{total === 1 ? '' : 's'}.{' '}
              {problemCount > 0 ? (
                <span className="font-semibold text-red-700 dark:text-red-300">
                  {problemCount} need{problemCount === 1 ? 's' : ''} a look.
                </span>
              ) : (
                <span className="text-green-700 dark:text-green-300">No problems found so far.</span>
              )}
            </p>
            <label className="flex items-center gap-2 text-sm text-warm-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(e) => setOnlyProblems(e.target.checked)}
                className="rounded border-warm-300 dark:border-gray-600"
              />
              Only show ones that need a look
            </label>
          </div>

          {visibleRows.length === 0 ? (
            <p className="text-sm text-warm-500 dark:text-gray-400">Nothing to show with this filter.</p>
          ) : (
            <>
              {/* Mobile: stacked cards */}
              <ul className="md:hidden space-y-2">
                {visibleRows.map((row) => {
                  const sug = suggestedRelease(row);
                  return (
                    <li key={row.itemId} className="rounded-lg border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-sm space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/organizer/edit-item/${row.itemId}`} className="font-semibold text-warm-900 dark:text-gray-100 underline break-words min-w-0">
                          {row.title || 'Untitled item'}
                        </Link>
                        <StatusChip row={row} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-warm-500 dark:text-gray-400">Listed as</p>
                        <ReleaseText release={row.listedRelease} empty="Unknown" vetoes={row.listedHasHardVeto ? row.listedRelease?.vetoes : undefined} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-warm-500 dark:text-gray-400">Suggested</p>
                        <ReleaseText release={sug.release} empty="No suggestion" />
                        {sug.note && <span className="block text-xs text-amber-700 dark:text-amber-300">{sug.note}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-warm-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-warm-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-warm-500 dark:text-gray-400">
                    <tr>
                      <th scope="col" className="px-3 py-2">Item</th>
                      <th scope="col" className="px-3 py-2">Listed as</th>
                      <th scope="col" className="px-3 py-2">Suggested</th>
                      <th scope="col" className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                    {visibleRows.map((row) => {
                      const sug = suggestedRelease(row);
                      return (
                        <tr key={row.itemId} className="align-top">
                          <td className="px-3 py-2 max-w-[14rem]">
                            <Link href={`/organizer/edit-item/${row.itemId}`} className="text-warm-900 dark:text-gray-100 underline break-words">
                              {row.title || 'Untitled item'}
                            </Link>
                          </td>
                          <td className="px-3 py-2 max-w-[16rem]">
                            <ReleaseText release={row.listedRelease} empty="Unknown" vetoes={row.listedHasHardVeto ? row.listedRelease?.vetoes : undefined} />
                          </td>
                          <td className="px-3 py-2 max-w-[16rem]">
                            <ReleaseText release={sug.release} empty="No suggestion" />
                            {sug.note && <span className="block text-xs text-amber-700 dark:text-amber-300">{sug.note}</span>}
                          </td>
                          <td className="px-3 py-2">
                            <StatusChip row={row} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            {report.nextOffset != null && (
              <button
                type="button"
                onClick={() => sweep.mutate(report.nextOffset as number)}
                disabled={sweep.isPending}
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 text-sm"
              >
                {sweep.isPending ? 'Checking listings...' : `Check the next ${Math.max(1, Math.min(PAGE_SIZE, total - checkedCount))}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => sweep.mutate(0)}
              disabled={sweep.isPending}
              className="w-full sm:w-auto bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg disabled:opacity-50 text-sm"
            >
              Start over
            </button>
          </div>
          <p className="text-xs text-warm-500 dark:text-gray-400">
            To fix a listing, open the item and pick the right release in its Discogs section.
          </p>
        </>
      )}
    </div>
  );
};

export default DiscogsListingCheck;
