/**
 * LoyaltyPassport: the "Sale Passport" (feature #29 rebuild, 2026-09-29).
 *
 * A collectible passport of 12 dated, place-aware stamps in four categories, with Bronze / Silver /
 * Gold / Platinum milestone badges. Free for every shopper. Rendered as a section on
 * /shopper/achievements. Named "Sale Passport" on purpose: "Collector Passport" (specialties) and
 * "Explorer Passport" already belong to a different feature (/shopper/explorer-passport).
 * Design record: claude_docs/feature-notes/ADR-sale-passport-2026-09-29.md
 *
 * The filename and the named export `LoyaltyPassport` are kept from the original component.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PassportSlot,
  useLoyaltyPassport,
  useMarkPassportSeen,
} from '../hooks/useLoyaltyPassport';
import { useAuth } from './AuthContext';
import MilestoneUnlockedToast, { UnlockToastItem, claimUnlockToasts } from './MilestoneUnlockedToast';

const MILESTONE_STYLE: Record<string, { bg: string; ring: string; glyph: string }> = {
  BRONZE: { bg: '#CD7F32', ring: '#A56424', glyph: '★' },
  SILVER: { bg: '#C0C0C0', ring: '#9A9A9A', glyph: '✦' },
  GOLD: { bg: '#FFD700', ring: '#C9A800', glyph: '✪' },
  PLATINUM: { bg: '#B8C4D0', ring: '#7F8FA0', glyph: '♛' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const CATEGORY_ORDER = ['VISIT', 'PURCHASE', 'SHARE', 'COMMUNITY'];

const StampCard: React.FC<{ slot: PassportSlot }> = ({ slot }) => {
  if (slot.earned) {
    return (
      <div
        className="relative rounded-lg border-2 border-sage-300 dark:border-sage-600 bg-sage-50 dark:bg-sage-700/20 p-3"
        aria-label={`${slot.name} stamp, earned`}
      >
        {slot.unseen && (
          <span className="absolute -top-2 -right-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            New
          </span>
        )}
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 border-2 border-sage-400 dark:border-sage-500 text-2xl">
            <span aria-hidden="true">{slot.icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-bold text-warm-900 dark:text-warm-100">{slot.name}</p>
              {slot.repeatable && slot.timesEarned > 1 && (
                <span className="rounded-full bg-sage-200 dark:bg-sage-700 px-2 py-0.5 text-xs font-semibold text-sage-700 dark:text-sage-200">
                  x{slot.timesEarned}
                </span>
              )}
            </div>
            <p className="text-xs text-warm-600 dark:text-warm-300 mt-0.5">
              Earned {formatDate(slot.lastEarnedAt)}
              {slot.latestPlaceLabel ? ` · ${slot.latestPlaceLabel}` : ''}
            </p>
            {slot.repeatable && slot.progress && (
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                Next: {slot.progress.current}/{slot.progress.target} {slot.progress.label}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const pct = slot.progress && slot.progress.target > 0
    ? Math.min(100, Math.round((slot.progress.current / slot.progress.target) * 100))
    : 0;

  return (
    <div
      className="rounded-lg border-2 border-dashed border-warm-300 dark:border-gray-600 bg-warm-50 dark:bg-gray-800/40 p-3"
      aria-label={`${slot.name} stamp, not yet earned`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-warm-300 dark:border-gray-600 text-2xl opacity-40 grayscale">
          <span aria-hidden="true">{slot.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-warm-700 dark:text-warm-200">{slot.name}</p>
          <p className="text-xs text-warm-600 dark:text-warm-300 mt-0.5">{slot.howToEarn}</p>
          {slot.progress && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-warm-200 dark:bg-gray-700">
                <div className="h-full rounded-full bg-sage-500 dark:bg-sage-400 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-warm-500 dark:text-warm-400">
                {slot.progress.current}/{slot.progress.target} {slot.progress.label}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export function LoyaltyPassport() {
  const { user } = useAuth();
  const { passport: data, isLoading, error, refetch } = useLoyaltyPassport();
  const markSeen = useMarkPassportSeen();
  const [toasts, setToasts] = useState<UnlockToastItem[]>([]);

  const passport = data?.passport;

  // Unlock toasts (stamps and milestones the shopper has not been told about yet).
  useEffect(() => {
    if (!passport) return;
    const stampIds = claimUnlockToasts(passport.unseen.stamps.map((s) => s.id));
    const milestoneIds = claimUnlockToasts(passport.unseen.milestones.map((m) => `milestone-${m.milestone}`));
    if (stampIds.length === 0 && milestoneIds.length === 0) return;

    const next: UnlockToastItem[] = [];
    for (const s of passport.unseen.stamps) {
      if (!stampIds.includes(s.id)) continue;
      next.push({
        id: s.id,
        icon: s.icon,
        title: `${s.name} stamp`,
        message: s.placeLabel ? `Added to your Sale Passport from ${s.placeLabel}.` : 'Added to your Sale Passport.',
      });
    }
    for (const m of passport.unseen.milestones) {
      if (!milestoneIds.includes(`milestone-${m.milestone}`)) continue;
      next.push({
        id: `milestone-${m.milestone}`,
        icon: '✨',
        title: m.name,
        message: "You've reached a new milestone! New badge unlocked.",
      });
    }
    setToasts((prev) => [...prev, ...next]);
    markSeen.mutate({
      stampIds,
      milestones: passport.unseen.milestones.filter((m) => milestoneIds.includes(`milestone-${m.milestone}`)).map((m) => m.milestone),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passport]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (isLoading) {
    return (
      <section id="sale-passport" aria-busy="true" aria-label="Sale Passport loading">
        <div className="rounded-lg border border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
          <div className="h-6 w-1/3 rounded bg-warm-200 dark:bg-gray-700 mb-4" />
          <div className="h-3 w-2/3 rounded bg-warm-200 dark:bg-gray-700 mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-warm-100 dark:bg-gray-700/60" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !data || !passport) {
    return (
      <section id="sale-passport">
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <p className="font-semibold text-red-700 dark:text-red-300">We could not load your Sale Passport.</p>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">Your stamps are safe. Please try again.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  const pctToNext = passport.next
    ? Math.min(100, Math.round((passport.earnedSlots / passport.next.milestone) * 100))
    : 100;

  const categories = CATEGORY_ORDER
    .map((cat) => ({ cat, slots: passport.slots.filter((s) => s.category === cat) }))
    .filter((c) => c.slots.length > 0);

  return (
    <section id="sale-passport" aria-labelledby="sale-passport-title">
      <div className="rounded-lg border-2 border-sage-300 dark:border-sage-700 bg-white dark:bg-gray-800 shadow-lg p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="sale-passport-title" className="text-2xl font-bold text-sage-700 dark:text-sage-200">
              🛂 Sale Passport
            </h2>
            <p className="text-sm text-warm-600 dark:text-warm-300 mt-1">
              Collect a dated stamp for every kind of treasure hunting. Free for every shopper.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-sage-700 dark:text-sage-300">
              {passport.earnedSlots}
              <span className="text-lg font-semibold text-warm-500 dark:text-warm-400"> / {passport.totalSlots}</span>
            </p>
            <p className="text-xs text-warm-500 dark:text-warm-400">stamps collected</p>
          </div>
        </div>

        {/* Progress toward next milestone */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-warm-700 dark:text-warm-200 mb-1">
            <span>
              {passport.next
                ? `Next badge: ${passport.next.name}`
                : 'Passport complete. You hold every badge.'}
            </span>
            {passport.next && (
              <span>
                {passport.next.stampsToGo} more {passport.next.stampsToGo === 1 ? 'stamp' : 'stamps'}
              </span>
            )}
          </div>
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-warm-200 dark:bg-gray-700"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pctToNext}
            aria-label="Progress to next Sale Passport badge"
          >
            <div className="h-full rounded-full bg-sage-500 dark:bg-sage-400 transition-all" style={{ width: `${pctToNext}%` }} />
          </div>
        </div>

        {/* Milestone badges */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Sale Passport badges">
          {passport.milestones.map((m) => {
            const style = MILESTONE_STYLE[m.badgeType] ?? MILESTONE_STYLE.BRONZE;
            return (
              <div
                key={m.milestone}
                className={`flex flex-col items-center rounded-lg border p-3 text-center ${
                  m.earned
                    ? 'border-warm-300 dark:border-gray-600 bg-warm-50 dark:bg-gray-700/40'
                    : 'border-dashed border-warm-300 dark:border-gray-600 opacity-60'
                }`}
                title={m.earned ? `${m.name}, earned ${formatDate(m.earnedAt)}` : `${m.name}: collect ${m.milestone} stamps`}
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white ${m.earned ? '' : 'grayscale'}`}
                  style={{ backgroundColor: style.bg, boxShadow: `0 0 0 3px ${style.ring}` }}
                  aria-hidden="true"
                >
                  {style.glyph}
                </div>
                <p className="mt-2 text-xs font-bold text-warm-900 dark:text-warm-100">{m.name}</p>
                <p className="text-[11px] text-warm-500 dark:text-warm-400">
                  {m.earned ? `Earned ${formatDate(m.earnedAt)}` : `${m.milestone} stamps`}
                </p>
              </div>
            );
          })}
        </div>

        {/* Empty passport nudge */}
        {passport.earnedSlots === 0 && (
          <div className="mb-6 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Your passport is empty. Time to hunt.</p>
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
              Check in at a sale to earn your first stamp, First Steps.
            </p>
            <Link
              href="/map"
              className="mt-2 inline-block rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Find a sale near you
            </Link>
          </div>
        )}

        {/* Stamp grid by category */}
        <div className="space-y-6">
          {categories.map(({ cat, slots }) => (
            <div key={cat}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-warm-600 dark:text-warm-300 mb-2">
                {slots[0].categoryLabel}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {slots.map((slot) => (
                  <StampCard key={slot.key} slot={slot} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Stamp log */}
        {passport.history.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-bold uppercase tracking-wide text-warm-600 dark:text-warm-300 mb-2">Stamp log</h3>
            <ul className="divide-y divide-warm-200 dark:divide-gray-700 rounded-lg border border-warm-200 dark:border-gray-700">
              {passport.history.slice(0, 8).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-warm-800 dark:text-warm-100">
                    <span aria-hidden="true">{h.icon}</span>
                    {h.name}
                  </span>
                  <span className="text-xs text-warm-500 dark:text-warm-400 text-right">
                    {formatDate(h.earnedAt)}
                    {h.placeLabel ? ` · ${h.placeLabel}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Lifetime activity (legacy tally, kept) */}
        <p className="mt-6 text-xs text-warm-500 dark:text-warm-400">
          Lifetime activity: {passport.activity.total} {passport.activity.total === 1 ? 'action' : 'actions'} counted
          {passport.activity.tier ? ` · ${passport.activity.tier.charAt(0)}${passport.activity.tier.slice(1).toLowerCase()} activity tier` : ''}
          {passport.activity.nextTierAt ? ` · next tier at ${passport.activity.nextTierAt}` : ''}
        </p>

        {/* Hunt Pass note: perks are XP, never Passport access */}
        {!user?.huntPassActive && (
          <p className="mt-2 text-xs text-warm-500 dark:text-warm-400">
            Every stamp and badge is free. Hunt Pass holders also earn 1.5x XP on every action.{' '}
            <Link href="/shopper/hunt-pass" className="font-semibold text-sage-700 dark:text-sage-300 hover:underline">
              Learn about Hunt Pass
            </Link>
          </p>
        )}
      </div>

      <MilestoneUnlockedToast items={toasts} onDismiss={dismissToast} />
    </section>
  );
}

export default LoyaltyPassport;
