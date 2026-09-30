/**
 * /shopper/crews/[crewId] - Crew page
 * Header + join/leave + share, roster with founder tools, leaderboard, and the photo feed.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import ConfirmDialog from '../../../components/crews/ConfirmDialog';
import {
  useCrewDetail,
  useCrewLeaderboard,
  useCrewFeed,
  useMyCrews,
  useJoinCrew,
  useLeaveCrew,
  useRemoveCrewMember,
  useTransferCrew,
  useDisbandCrew,
  crewErrorMessage,
  type CrewMemberRow,
} from '../../../hooks/useCrews';

type DialogState =
  | null
  | { type: 'leave' }
  | { type: 'remove'; member: CrewMemberRow }
  | { type: 'transfer'; member: CrewMemberRow }
  | { type: 'disband' };

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const CrewProfilePage = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const crewId = typeof router.query.crewId === 'string' ? router.query.crewId : undefined;

  const detail = useCrewDetail(crewId);
  const leaderboard = useCrewLeaderboard(crewId);
  const feed = useCrewFeed(crewId);
  const mine = useMyCrews(!!user);

  const joinCrew = useJoinCrew();
  const leaveCrew = useLeaveCrew();
  const removeMember = useRemoveCrewMember(crewId || '');
  const transferCrew = useTransferCrew(crewId || '');
  const disbandCrew = useDisbandCrew(crewId || '');

  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogError, setDialogError] = useState('');
  const [disbandInput, setDisbandInput] = useState('');
  const [actionError, setActionError] = useState('');

  const crew = detail.data;
  // Member ids are opaque on the public roster, so the server tells us who the viewer is.
  const myMembership = crew && user ? crew.members.find((m) => m.isSelf) : undefined;
  const isMember = !!crew?.viewer?.isMember || !!myMembership;
  const isFounder = (crew?.viewer?.role ?? myMembership?.role) === 'FOUNDER';
  const isFull = !!crew && crew.memberCount >= crew.maxMembers;
  const atLimit = !!mine.data && mine.data.crews.length >= mine.data.limits.maxCrewsPerUser;

  const closeDialog = () => {
    setDialog(null);
    setDialogError('');
    setDisbandInput('');
  };

  const handleJoin = async () => {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/shopper/crews/${crewId}`)}`);
      return;
    }
    setActionError('');
    try {
      await joinCrew.mutateAsync(crewId!);
      showToast('You joined the crew.', 'success');
    } catch (err) {
      setActionError(crewErrorMessage(err, 'Could not join this crew.'));
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/shopper/crews/${crewId}`;
    try {
      if (typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function') {
        await (navigator as any).share({ title: `${crew?.name} on FindA.Sale`, url });
        return;
      }
    } catch {
      // User dismissed the share sheet or it failed; fall back to copying.
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Crew link copied.', 'success');
    } catch {
      showToast(url, 'info');
    }
  };

  const confirmDialog = async () => {
    if (!dialog || !crewId) return;
    setDialogError('');
    try {
      if (dialog.type === 'leave') {
        await leaveCrew.mutateAsync(crewId);
        showToast('You left the crew.', 'success');
        closeDialog();
        router.push('/shopper/crews');
        return;
      }
      if (dialog.type === 'remove') {
        await removeMember.mutateAsync(dialog.member.memberRef || dialog.member.userId);
        showToast(`${dialog.member.user.name} was removed.`, 'success');
      }
      if (dialog.type === 'transfer') {
        await transferCrew.mutateAsync(dialog.member.memberRef || dialog.member.userId);
        showToast(`${dialog.member.user.name} is now the founder.`, 'success');
      }
      if (dialog.type === 'disband') {
        await disbandCrew.mutateAsync(disbandInput);
        showToast('Crew disbanded.', 'success');
        closeDialog();
        router.push('/shopper/crews');
        return;
      }
      closeDialog();
    } catch (err) {
      setDialogError(crewErrorMessage(err));
    }
  };

  const dialogBusy =
    leaveCrew.isPending || removeMember.isPending || transferCrew.isPending || disbandCrew.isPending;

  if (detail.isLoading || !crewId) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-warm-600 dark:text-warm-400">Loading crew...</p>
      </div>
    );
  }

  if (detail.isError || !crew) {
    const notFound = (detail.error as any)?.response?.status === 404;
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-warm-700 dark:text-warm-300 mb-4">
          {notFound ? 'This crew was not found. It may have been disbanded.' : 'We could not load this crew.'}
        </p>
        {!notFound && (
          <button
            type="button"
            onClick={() => detail.refetch()}
            className="mb-4 min-h-[44px] px-4 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700"
          >
            Try again
          </button>
        )}
        <Link href="/shopper/crews" className="text-purple-700 dark:text-purple-300 hover:underline">
          Back to Crews
        </Link>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{`${crew.name} - Crews - FindA.Sale`}</title>
        <meta name="description" content={crew.description || `${crew.name}, a shopper crew on FindA.Sale.`} />
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-8 md:py-12 space-y-6">
          <Link href="/shopper/crews" className="inline-block text-sm font-semibold text-purple-700 dark:text-purple-300 hover:underline">
            ← All crews
          </Link>

          {/* Header */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-5 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-4xl font-bold text-warm-900 dark:text-warm-100 mb-1 break-words">
                  {crew.name}
                </h1>
                <p className="text-warm-600 dark:text-warm-400 text-sm">
                  Founded by{' '}
                  {crew.founder?.profilePublic ? (
                    <Link href={`/shopper/profile/${crew.founder.id}`} className="underline">
                      {crew.founder.name}
                    </Link>
                  ) : (
                    <span>{crew.founder?.name ?? 'a former member'}</span>
                  )}
                  {' '}on {formatDate(crew.createdAt)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl md:text-3xl font-bold text-purple-600 dark:text-purple-300">
                  {crew.memberCount}
                  <span className="text-base font-normal text-warm-500 dark:text-warm-400"> / {crew.maxMembers}</span>
                </p>
                <p className="text-sm text-warm-600 dark:text-warm-400">Members</p>
              </div>
            </div>

            {crew.description && (
              <p className="mt-4 text-warm-700 dark:text-warm-300 leading-relaxed whitespace-pre-line break-words">
                {crew.description}
              </p>
            )}

            {actionError && (
              <p role="alert" className="mt-4 p-3 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-100 rounded-md text-sm">
                {actionError}
              </p>
            )}

            <div className="mt-5 flex flex-col sm:flex-row sm:flex-wrap gap-3">
              {!isMember && (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={joinCrew.isPending || isFull || (!!user && atLimit)}
                  className="min-h-[44px] px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isFull ? 'Crew is full' : joinCrew.isPending ? 'Joining...' : user ? 'Join crew' : 'Sign in to join'}
                </button>
              )}
              {isMember && !isFounder && (
                <button
                  type="button"
                  onClick={() => setDialog({ type: 'leave' })}
                  className="min-h-[44px] px-6 py-2 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-900 dark:text-warm-100 font-semibold hover:bg-warm-50 dark:hover:bg-gray-700"
                >
                  Leave crew
                </button>
              )}
              <button
                type="button"
                onClick={handleShare}
                className="min-h-[44px] px-6 py-2 rounded-lg border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-200 font-semibold hover:bg-purple-50 dark:hover:bg-purple-900/30"
              >
                Share crew link
              </button>
            </div>

            {!isMember && user && atLimit && (
              <p className="mt-3 text-sm text-warm-600 dark:text-warm-400">
                You are in {mine.data?.limits.maxCrewsPerUser} crews already. Leave one to join this crew.
              </p>
            )}
            {isMember && (
              <p className="mt-3 text-sm font-semibold text-purple-700 dark:text-purple-300">
                {isFounder ? 'You are the founder of this crew.' : 'You are a member of this crew.'}
              </p>
            )}
            {isFounder && (
              <p className="mt-1 text-sm text-warm-600 dark:text-warm-400">
                Founders cannot leave. To step down, make another member the founder, or disband the crew below.
              </p>
            )}
          </section>

          {/* Members */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden" aria-labelledby="crew-members-heading">
            <div className="px-5 md:px-8 py-4 border-b border-warm-200 dark:border-gray-700">
              <h2 id="crew-members-heading" className="text-xl md:text-2xl font-bold text-warm-900 dark:text-warm-100">
                Members
              </h2>
            </div>
            <ul className="divide-y divide-warm-200 dark:divide-gray-700">
              {crew.members.map((m) => (
                <li key={m.userId} className="px-5 md:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    {m.user.profilePublic ? (
                      <Link href={`/shopper/profile/${m.userId}`} className="font-semibold text-warm-900 dark:text-warm-100 hover:underline break-words">
                        {m.user.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-warm-900 dark:text-warm-100 break-words">{m.user.name}</span>
                    )}
                    <p className="text-xs text-warm-500 dark:text-warm-400">
                      {m.role === 'FOUNDER' ? 'Founder' : 'Member'} · Joined {formatDate(m.joinedAt)}
                    </p>
                  </div>
                  {isFounder && !m.isSelf && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDialog({ type: 'transfer', member: m })}
                        className="min-h-[44px] px-3 text-sm font-semibold rounded-lg border border-warm-300 dark:border-gray-600 text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700"
                      >
                        Make founder
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialog({ type: 'remove', member: m })}
                        className="min-h-[44px] px-3 text-sm font-semibold rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {isFounder && (
              <div className="px-5 md:px-8 py-4 border-t border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-900/40">
                <p className="text-sm text-warm-700 dark:text-warm-300 mb-3">
                  Disbanding removes the crew and all memberships. The {mine.data?.limits.creationCost ?? 500} XP creation cost is not refunded.
                </p>
                <button
                  type="button"
                  onClick={() => setDialog({ type: 'disband' })}
                  className="min-h-[44px] px-4 text-sm font-semibold rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  Disband crew
                </button>
              </div>
            )}
          </section>

          {/* Leaderboard */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden" aria-labelledby="crew-leaderboard-heading">
            <div className="px-5 md:px-8 py-4 border-b border-warm-200 dark:border-gray-700">
              <h2 id="crew-leaderboard-heading" className="text-xl md:text-2xl font-bold text-warm-900 dark:text-warm-100">
                Leaderboard
              </h2>
              <p className="text-sm text-warm-600 dark:text-warm-400">Members ranked by guild XP.</p>
            </div>
            {leaderboard.isLoading ? (
              <p className="px-5 md:px-8 py-8 text-warm-600 dark:text-warm-400">Loading leaderboard...</p>
            ) : leaderboard.isError ? (
              <div className="px-5 md:px-8 py-8 text-warm-700 dark:text-warm-300">
                <p className="mb-3">We could not load the leaderboard.</p>
                <button
                  type="button"
                  onClick={() => leaderboard.refetch()}
                  className="min-h-[44px] px-4 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700"
                >
                  Try again
                </button>
              </div>
            ) : leaderboard.data && leaderboard.data.length > 0 ? (
              <ol className="divide-y divide-warm-200 dark:divide-gray-700">
                {leaderboard.data.map((m) => (
                  <li key={m.userId} className="px-5 md:px-8 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 shrink-0 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center font-bold text-purple-600 dark:text-purple-300">
                        {m.rank}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-warm-900 dark:text-warm-100 break-words">{m.user.name}</p>
                        <p className="text-xs text-warm-500 dark:text-warm-400">{m.role === 'FOUNDER' ? 'Founder' : 'Member'}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-purple-600 dark:text-purple-300">{m.user.guildXp.toLocaleString()} XP</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400">{m.user.explorerRank}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 md:px-8 py-8 text-center text-warm-600 dark:text-warm-400">No members yet</p>
            )}
          </section>

          {/* Feed */}
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden" aria-labelledby="crew-feed-heading">
            <div className="px-5 md:px-8 py-4 border-b border-warm-200 dark:border-gray-700">
              <h2 id="crew-feed-heading" className="text-xl md:text-2xl font-bold text-warm-900 dark:text-warm-100">
                Recent photos from members
              </h2>
              <p className="text-sm text-warm-600 dark:text-warm-400">
                Approved photos and hauls posted by crew members. Saves, holds and messages are not shown here.
              </p>
            </div>
            {feed.isLoading ? (
              <p className="px-5 md:px-8 py-8 text-warm-600 dark:text-warm-400">Loading photos...</p>
            ) : feed.isError ? (
              <div className="px-5 md:px-8 py-8 text-warm-700 dark:text-warm-300">
                <p className="mb-3">We could not load the photos.</p>
                <button
                  type="button"
                  onClick={() => feed.refetch()}
                  className="min-h-[44px] px-4 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700"
                >
                  Try again
                </button>
              </div>
            ) : feed.data && feed.data.length > 0 ? (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 md:p-6">
                {feed.data.map((p) => (
                  <li key={p.id} className="rounded-lg overflow-hidden border border-warm-200 dark:border-gray-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.photoUrl}
                      alt={p.caption || `Photo by ${p.user.name}`}
                      loading="lazy"
                      className="w-full aspect-square object-cover bg-warm-100 dark:bg-gray-700"
                    />
                    <div className="p-2">
                      <p className="text-xs font-semibold text-warm-900 dark:text-warm-100 truncate">{p.user.name}</p>
                      {p.caption && <p className="text-xs text-warm-600 dark:text-warm-400 line-clamp-2">{p.caption}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 md:px-8 py-8 text-center text-warm-600 dark:text-warm-400">
                No photos yet. When members post approved photos or hauls, they show up here.
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Confirmations */}
      <ConfirmDialog
        open={dialog?.type === 'leave'}
        title="Leave this crew?"
        confirmLabel="Leave crew"
        destructive
        busy={dialogBusy}
        error={dialogError}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
      >
        <p>You will leave {crew.name}. You can join again later if there is room and you are under your crew limit.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.type === 'remove'}
        title="Remove this member?"
        confirmLabel="Remove member"
        destructive
        busy={dialogBusy}
        error={dialogError}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
      >
        <p>
          {dialog?.type === 'remove' ? dialog.member.user.name : 'This member'} will be removed from {crew.name}. Because
          crews are public, they can join again if there is room.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.type === 'transfer'}
        title="Make this member the founder?"
        confirmLabel="Transfer crew"
        destructive
        busy={dialogBusy}
        error={dialogError}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
      >
        <p>
          {dialog?.type === 'transfer' ? dialog.member.user.name : 'This member'} will become the founder of {crew.name}.
          You will become a regular member and lose the founder tools. This cannot be undone by you.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.type === 'disband'}
        title="Disband this crew?"
        confirmLabel="Disband crew"
        destructive
        busy={dialogBusy}
        confirmDisabled={disbandInput.trim().toLowerCase() !== crew.name.toLowerCase()}
        error={dialogError}
        onConfirm={confirmDialog}
        onCancel={closeDialog}
      >
        <p>
          This removes {crew.name} and all {crew.memberCount} membership{crew.memberCount === 1 ? '' : 's'}. It cannot be
          undone and the creation XP is not refunded.
        </p>
        <label htmlFor="disband-confirm" className="block font-semibold">
          Type the crew name to confirm
        </label>
        <input
          id="disband-confirm"
          type="text"
          value={disbandInput}
          onChange={(e) => setDisbandInput(e.target.value)}
          autoComplete="off"
          placeholder={crew.name}
          className="w-full min-h-[44px] rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-warm-900 dark:text-warm-100"
        />
      </ConfirmDialog>
    </>
  );
};

export default CrewProfilePage;
