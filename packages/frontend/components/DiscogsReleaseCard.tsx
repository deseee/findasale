/**
 * DiscogsReleaseCard (ADR-132 section 5 / 11.4)
 *
 * Read-only card for the Discogs release an item is matched to: thumbnail, "Artist - Title",
 * format, label + catalog number, year, country, a link to the release on discogs.com, and a
 * status badge. Also used (compact) inside the release picker's radio cards.
 */
import React from 'react';
import {
  DiscogsCandidate,
  DiscogsMatchStatus,
  discogsReleaseUrl,
  formatClassLabel,
} from '../types/discogsMatch';

interface StatusBadgeProps {
  status: DiscogsMatchStatus | null;
  draftOnly?: boolean;
}

export const DiscogsStatusBadge: React.FC<StatusBadgeProps> = ({ status, draftOnly }) => {
  let label = 'Not checked yet';
  let cls = 'bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-gray-300';
  if (status === 'auto_high') {
    label = draftOnly ? 'Auto-matched, pressing not confirmed' : 'Auto-matched';
    cls = draftOnly
      ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'
      : 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200';
  } else if (status === 'confirmed') {
    label = 'Confirmed';
    cls = 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200';
  } else if (status === 'needs_selection') {
    label = 'Needs your pick';
    cls = 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200';
  } else if (status === 'not_in_discogs') {
    label = 'Not in Discogs';
    cls = 'bg-warm-200 dark:bg-gray-700 text-warm-800 dark:text-gray-200';
  }
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${cls}`}>{label}</span>
  );
};

interface DiscogsReleaseCardProps {
  release: DiscogsCandidate | null;
  status?: DiscogsMatchStatus | null;
  draftOnly?: boolean;
  /** Compact variant for picker radio cards: no status badge, smaller thumbnail. */
  compact?: boolean;
  /** Hide the "View on Discogs" link (e.g. when the card sits inside a clickable label). */
  hideLink?: boolean;
}

const releaseFacts = (r: DiscogsCandidate): string[] => {
  const facts: string[] = [];
  const fmt = formatClassLabel(r.formatClass) || (r.formats.length ? r.formats.slice(0, 3).join(', ') : null);
  if (fmt) facts.push(fmt);
  const label = r.labels.length ? r.labels[0] : null;
  if (label && r.catno) facts.push(`${label} ${r.catno}`);
  else if (label) facts.push(label);
  else if (r.catno) facts.push(`Cat # ${r.catno}`);
  if (r.year) facts.push(String(r.year));
  if (r.country) facts.push(r.country);
  return facts;
};

const DiscogsReleaseCard: React.FC<DiscogsReleaseCardProps> = ({ release, status, draftOnly, compact, hideLink }) => {
  if (!release) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-warm-300 dark:border-gray-600 p-3">
        <p className="text-sm text-warm-600 dark:text-gray-400">No Discogs release selected yet.</p>
        {status !== undefined && <DiscogsStatusBadge status={status ?? null} draftOnly={draftOnly} />}
      </div>
    );
  }

  const facts = releaseFacts(release);
  const thumbSize = compact ? 'w-12 h-12' : 'w-16 h-16';
  const href = release.uri || discogsReleaseUrl(release.releaseId);

  return (
    <div
      className={`flex gap-3 min-w-0 ${
        compact ? '' : 'rounded-lg border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3'
      }`}
    >
      {release.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={release.thumb}
          alt=""
          loading="lazy"
          className={`${thumbSize} flex-shrink-0 rounded object-cover bg-warm-100 dark:bg-gray-700`}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`${thumbSize} flex-shrink-0 rounded bg-warm-100 dark:bg-gray-700 flex items-center justify-center text-warm-400 dark:text-gray-500`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-warm-900 dark:text-gray-100 break-words">
            {release.artist ? `${release.artist} - ${release.title}` : release.title}
          </p>
          {!compact && status !== undefined && <DiscogsStatusBadge status={status ?? null} draftOnly={draftOnly} />}
        </div>
        {facts.length > 0 && (
          <p className="text-xs text-warm-600 dark:text-gray-400 mt-0.5 break-words">{facts.join(' · ')}</p>
        )}
        {!hideLink && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-1 text-xs font-medium text-blue-600 dark:text-blue-400 underline"
          >
            View on Discogs
          </a>
        )}
        {!compact && draftOnly && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Draft only until confirmed. Several pressings of this album look alike, so we picked the most
            collected one. Confirm it (or pick another) before it can go live on Discogs.
          </p>
        )}
      </div>
    </div>
  );
};

export default DiscogsReleaseCard;
