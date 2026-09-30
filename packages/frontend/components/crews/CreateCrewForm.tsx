import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../AuthContext';
import { useToast } from '../ToastContext';
import { useCreateCrew, useMyCrews, crewErrorMessage } from '../../hooks/useCrews';
import ConfirmDialog from './ConfirmDialog';

const NAME_MIN = 3;
const NAME_MAX = 30;
const DESC_MAX = 500;

/**
 * Create tab. Shows the XP cost and the shopper's spendable XP, disables with clear copy when
 * they cannot afford it or are at the crew limit, and asks for confirmation before spending.
 */
const CreateCrewForm: React.FC = () => {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const { data, isLoading, isError, refetch } = useMyCrews(!!user);
  const createCrew = useCreateCrew();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState('');

  if (!user) {
    return (
      <div className="rounded-lg bg-white dark:bg-gray-800 p-6 text-center shadow-sm">
        <p className="text-warm-700 dark:text-warm-300 mb-4">Sign in to start a crew.</p>
        <Link
          href="/login?redirect=/shopper/crews%3Ftab%3Dcreate"
          className="inline-flex min-h-[44px] items-center px-5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-warm-600 dark:text-warm-400">Loading...</p>;
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-red-800 dark:text-red-200">
        <p className="mb-3">We could not load your crew details.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="min-h-[44px] px-4 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const { limits, xp, crews } = data;
  const cost = limits.creationCost;
  const shortBy = Math.max(0, cost - xp.spendable);
  const held = xp.guildXp - xp.spendable;
  const atLimit = crews.length >= limits.maxCrewsPerUser;
  const trimmedName = name.replace(/\s+/g, ' ').trim();
  const nameValid = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;
  const canSubmit = nameValid && shortBy === 0 && !atLimit;

  const submit = async () => {
    setServerError('');
    try {
      const result = await createCrew.mutateAsync({
        name: trimmedName,
        description: description.trim() || undefined,
      });
      if (typeof result.remainingXp === 'number') {
        updateUser({ guildXp: result.remainingXp });
      }
      showToast(`Crew created. ${result.xpSpent} XP spent.`, 'success');
      setConfirming(false);
      router.push(`/shopper/crews/${result.id}`);
    } catch (err) {
      // Server rolls the whole thing back on any failure, so no XP was spent.
      setServerError(crewErrorMessage(err, 'Could not create the crew. You were not charged any XP.'));
    }
  };

  return (
    <div className="space-y-6">
      {/* XP cost card */}
      <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-4">
        <p className="text-warm-900 dark:text-warm-100 font-semibold">
          Creating a crew costs {cost.toLocaleString()} XP
        </p>
        <p className="text-sm text-warm-700 dark:text-warm-300 mt-1">
          You have <span className="font-semibold">{xp.spendable.toLocaleString()} spendable XP</span>
          {held > 0 && <> ({held.toLocaleString()} more is on hold and becomes spendable after 72 hours)</>}.
          The cost is a one-time spend and is not refunded if the crew is later disbanded.
        </p>
        {shortBy > 0 && (
          <p role="status" className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            You need {shortBy.toLocaleString()} more spendable XP to create a crew. Earn XP by visiting sales and
            posting hauls, or join an existing crew for free.
          </p>
        )}
        {atLimit && (
          <p role="status" className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            You are in {crews.length} of {limits.maxCrewsPerUser} allowed crews. Leave one to create a new crew.
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) setConfirming(true);
        }}
        className="space-y-5"
      >
        <div>
          <label htmlFor="crew-name" className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
            Crew name
          </label>
          <input
            id="crew-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            autoComplete="off"
            placeholder="e.g. Grand Rapids Mid-Century Hunters"
            className="w-full min-h-[44px] rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            aria-describedby="crew-name-help"
          />
          <p id="crew-name-help" className="mt-1 text-xs text-warm-500 dark:text-warm-400">
            {NAME_MIN} to {NAME_MAX} characters. Letters, numbers, spaces and - ' & . only. Names are unique.
            <span className="float-right">{trimmedName.length}/{NAME_MAX}</span>
          </p>
        </div>

        <div>
          <label htmlFor="crew-description" className="block text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
            Description <span className="font-normal text-warm-500 dark:text-warm-400">(optional)</span>
          </label>
          <textarea
            id="crew-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESC_MAX}
            rows={4}
            placeholder="What does your crew hunt for?"
            className="w-full rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="mt-1 text-xs text-warm-500 dark:text-warm-400 text-right">{description.length}/{DESC_MAX}</p>
        </div>

        <p className="text-sm text-warm-600 dark:text-warm-400">
          Crews are public. Anyone signed in can find your crew and join instantly, up to {limits.maxMembers} members.
        </p>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full sm:w-auto min-h-[44px] px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create crew ({cost.toLocaleString()} XP)
        </button>
      </form>

      <ConfirmDialog
        open={confirming}
        title="Spend XP to create this crew?"
        confirmLabel={`Spend ${cost.toLocaleString()} XP`}
        busy={createCrew.isPending}
        error={serverError}
        onConfirm={submit}
        onCancel={() => {
          setConfirming(false);
          setServerError('');
        }}
      >
        <p>
          <span className="font-semibold">{trimmedName}</span> will be created and you will be its founder.
        </p>
        <p>
          {cost.toLocaleString()} XP will be spent now. You will have{' '}
          {(xp.guildXp - cost).toLocaleString()} XP left. If anything goes wrong, no XP is taken.
        </p>
      </ConfirmDialog>
    </div>
  );
};

export default CreateCrewForm;
