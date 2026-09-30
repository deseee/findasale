import React from 'react';
import Link from 'next/link';
import type { CrewSummary } from '../../hooks/useCrews';

interface CrewCardProps {
  crew: CrewSummary;
  maxMembers: number;
  /** Shown as a badge, e.g. "Founder". */
  roleLabel?: string;
  /** Optional Join button (Browse tab). Omit for My Crews. */
  onJoin?: (crewId: string) => void;
  joining?: boolean;
  canJoin?: boolean;
  /** Why Join is disabled (crew limit reached, signed out, etc.). */
  joinHint?: string;
}

const CrewCard: React.FC<CrewCardProps> = ({ crew, maxMembers, roleLabel, onJoin, joining, canJoin = true, joinHint }) => {
  const showJoin = !!onJoin && !crew.isMember;
  const full = crew.isFull || crew.memberCount >= maxMembers;

  return (
    <li className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/shopper/crews/${crew.id}`}
            className="block text-lg font-bold text-warm-900 dark:text-warm-100 hover:text-purple-600 dark:hover:text-purple-300 break-words"
          >
            {crew.name}
          </Link>
          {crew.founder?.name && (
            <p className="text-xs text-warm-500 dark:text-warm-400">Founded by {crew.founder.name}</p>
          )}
        </div>
        {roleLabel && (
          <span className="shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-200">
            {roleLabel}
          </span>
        )}
      </div>

      {crew.description && (
        <p className="mt-2 text-sm text-warm-700 dark:text-warm-300 line-clamp-3">{crew.description}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-warm-600 dark:text-warm-400">
          <span className="font-semibold text-warm-900 dark:text-warm-100">{crew.memberCount}</span> / {maxMembers} members
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/shopper/crews/${crew.id}`}
            className="min-h-[44px] inline-flex items-center px-3 text-sm font-semibold text-purple-700 dark:text-purple-300 hover:underline"
          >
            View
          </Link>
          {showJoin && (
            <button
              type="button"
              onClick={() => onJoin!(crew.id)}
              disabled={joining || full || !canJoin}
              title={full ? 'This crew is full' : joinHint}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {full ? 'Full' : joining ? 'Joining...' : 'Join'}
            </button>
          )}
          {!showJoin && onJoin && crew.isMember && (
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">Joined</span>
          )}
        </div>
      </div>
      {showJoin && !canJoin && joinHint && (
        <p className="mt-2 text-xs text-warm-500 dark:text-warm-400">{joinHint}</p>
      )}
    </li>
  );
};

export default CrewCard;
