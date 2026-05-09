/**
 * BroadcastSection — Brief E · Broadcast history + entry point
 *
 * Redesigned to match Brief E design:
 * - Broadcast history list (date, subject, recipients, open rate placeholder)
 * - Frequency note card
 * - "New broadcast" CTA that opens BroadcastComposer
 * - Empty state with follower count
 * - SIMPLE tier: shows locked section with upgrade prompt (via BroadcastComposer)
 *
 * Schema confirmed: OrganizerBroadcast { subject, message, sentAt, recipientCount }
 */
import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import BroadcastComposer from './BroadcastComposer';

interface Broadcast {
  id: string;
  subject: string;
  message?: string;
  sentAt: string;
  recipientCount: number;
}

interface BroadcastSectionProps {
  /** Organizer's subscription tier — 'SIMPLE' | 'PRO' | 'TEAMS' */
  tier?: string;
  /** Number of followers (passed in from parent settings page context) */
  followerCount?: number;
  /** Organizer display name for email preview */
  organizerName?: string;
}

// ---------- Small icon (self-contained) ----------

const Icon = ({ name, size = 14 }: { name: string; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    bell: (
      <>
        <path d="M6 16V11a6 6 0 0112 0v5l1.5 2H4.5L6 16z" />
        <path d="M10 20a2 2 0 004 0" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v.01M11 12h1v5h1" />
      </>
    ),
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    chevron: <path d="M9 6l6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}
      aria-hidden="true"
    >
      {paths[name] ?? null}
    </svg>
  );
};

// ---------- Frequency helpers ----------

function daysSinceLastBroadcast(sentAt: string | null): number | null {
  if (!sentAt) return null;
  const ms = Date.now() - new Date(sentAt).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function nextAllowedDate(sentAt: string): string {
  const next = new Date(new Date(sentAt).getTime() + 7 * 24 * 60 * 60 * 1000);
  return next.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatSentDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function snippetFrom(message?: string): string {
  if (!message) return '';
  return message.length > 80 ? message.slice(0, 80) + '…' : message;
}

// ---------- History row ----------

const HistoryRow = ({ broadcast, last }: { broadcast: Broadcast; last: boolean }) => (
  <div
    className={`grid gap-4 py-4 items-center ${
      last ? '' : 'border-b border-warm-100 dark:border-gray-700'
    }`}
    style={{ gridTemplateColumns: '100px 1fr 100px 80px' }}
  >
    <span className="font-mono text-[11px] uppercase tracking-widest text-warm-400 dark:text-gray-500">
      {formatSentDate(broadcast.sentAt)}
    </span>
    <div className="min-w-0">
      <p className="text-sm font-medium text-warm-900 dark:text-gray-100 truncate">
        {broadcast.subject}
      </p>
      {broadcast.message && (
        <p className="text-xs text-warm-400 dark:text-gray-500 mt-0.5 truncate">
          {snippetFrom(broadcast.message)}
        </p>
      )}
    </div>
    <span className="font-mono text-xs text-warm-700 dark:text-gray-300 tabular-nums">
      {broadcast.recipientCount.toLocaleString()} sent
    </span>
    <span className="font-mono text-xs text-warm-400 dark:text-gray-500">—</span>
  </div>
);

// ---------- Main component ----------

const BroadcastSection: React.FC<BroadcastSectionProps> = ({
  tier,
  followerCount = 0,
  organizerName = 'Your Organization',
}) => {
  const { showToast } = useToast();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const fetchBroadcasts = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/organizers/me/broadcasts');
      setBroadcasts(res.data || []);
    } catch {
      setBroadcasts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const lastBroadcast = broadcasts[0] ?? null;
  const lastSentAt = lastBroadcast?.sentAt ?? null;
  const daysSince = daysSinceLastBroadcast(lastSentAt);
  const canSendNow = daysSince === null || daysSince >= 7;

  // Open composer (used by quick-compose external callers too)
  const openComposer = () => setShowComposer(true);

  // ---------- Composer overlay ----------

  if (showComposer) {
    return (
      <div className="min-h-[600px]">
        <BroadcastComposer
          tier={tier}
          followerCount={followerCount}
          organizerName={organizerName}
          lastSentAt={lastSentAt}
          onSent={(count) => {
            showToast(`Broadcast sent to ${count} followers`, 'success');
            fetchBroadcasts();
          }}
          onClose={() => setShowComposer(false)}
        />
      </div>
    );
  }

  // ---------- History view ----------

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-warm-900 dark:text-gray-100">
            Broadcasts
          </h2>
          <p className="text-sm text-warm-500 dark:text-gray-400 mt-0.5">
            {followerCount > 0 ? (
              <>
                You have <strong className="text-warm-900 dark:text-gray-100">{followerCount} followers.</strong>{' '}
                Send up to one broadcast every 7 days.
              </>
            ) : (
              'Build your follower list and send broadcasts to keep them in the loop.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={openComposer}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors"
        >
          <Icon name="plus" size={13} />
          New broadcast
        </button>
      </div>

      {/* Frequency note card */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
        <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
          <Icon name="clock" size={16} />
        </div>
        <div>
          {canSendNow ? (
            <>
              <p className="text-sm font-medium text-warm-900 dark:text-gray-100">
                {daysSince === null
                  ? 'No broadcasts sent yet — you can send anytime.'
                  : `Last broadcast was ${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago — you can send anytime.`}
              </p>
              <p className="text-xs text-warm-400 dark:text-gray-500 mt-0.5">
                We hold to one per week so your followers don&apos;t unsubscribe — they&apos;re worth
                more than any single send.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-warm-900 dark:text-gray-100">
                You sent a broadcast{' '}
                <strong>
                  {daysSince} {daysSince === 1 ? 'day' : 'days'} ago.
                </strong>
              </p>
              <p className="text-xs text-warm-400 dark:text-gray-500 mt-0.5">
                You can send again on <strong>{lastSentAt ? nextAllowedDate(lastSentAt) : '—'}</strong>
                . One per 7 days protects your follower list.
              </p>
            </>
          )}
        </div>
      </div>

      {/* History table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-warm-100 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      ) : broadcasts.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-warm-200 dark:border-gray-700 overflow-hidden">
          {/* Table header */}
          <div
            className="grid gap-4 px-4 py-2.5 border-b border-warm-200 dark:border-gray-600 bg-warm-50 dark:bg-gray-900"
            style={{ gridTemplateColumns: '100px 1fr 100px 80px' }}
          >
            {['Sent', 'Subject', 'Recipients', 'Open rate'].map((h) => (
              <span
                key={h}
                className="font-mono text-[10px] uppercase tracking-widest text-warm-400 dark:text-gray-500"
              >
                {h}
              </span>
            ))}
          </div>

          <div className="px-4">
            {broadcasts.map((b, i) => (
              <HistoryRow key={b.id} broadcast={b} last={i === broadcasts.length - 1} />
            ))}
          </div>
        </div>
      ) : (
        <div className="py-8 text-center">
          <div className="w-12 h-12 rounded-full mx-auto mb-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Icon name="bell" size={22} />
          </div>
          <p className="text-sm font-medium text-warm-900 dark:text-gray-100">
            No broadcasts yet
          </p>
          <p className="text-xs text-warm-400 dark:text-gray-500 mt-1 mb-4">
            {followerCount > 0
              ? `You have ${followerCount} followers waiting. Send them a message.`
              : 'Once followers find your storefront, you can message them here.'}
          </p>
          <button
            type="button"
            onClick={openComposer}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors"
          >
            Send your first broadcast
            <Icon name="arrow" size={13} />
          </button>
        </div>
      )}

      {/* Open-rate disclaimer */}
      {broadcasts.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-warm-400 dark:text-gray-500">
          <Icon name="info" size={12} />
          Open rates are coming in v2. We don&apos;t track them yet.
        </div>
      )}
    </div>
  );
};

export default BroadcastSection;
