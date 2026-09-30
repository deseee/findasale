/**
 * Creator Program opt-in (2026-09-29).
 *
 * Self-serve: an authenticated, email-verified user accepts the current terms and gets a CreatorProfile
 * (unique code) via POST /api/affiliate/creator/join. No role change is needed, the profile record is the gate.
 * Anonymous visitors see the pitch and are sent to sign in, then return here.
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { CREATOR_PROGRAM_DISPLAY as DISPLAY } from '../../lib/creatorProgram';

interface CreatorMe {
  joined: boolean;
  active: boolean;
  suspended: boolean;
  emailVerified: boolean;
  program: { termsVersion: string; commissionRatePercent: number; holdDays: number };
}

const CreatorJoinPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['creator-me', user?.id],
    queryFn: async () => (await api.get('/affiliate/creator/me')).data as CreatorMe,
    enabled: !!user?.id,
  });

  const program = me?.program ?? {
    termsVersion: DISPLAY.TERMS_VERSION,
    commissionRatePercent: DISPLAY.COMMISSION_RATE_PERCENT,
    holdDays: DISPLAY.HOLD_DAYS,
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/affiliate/creator/join', {
        acceptTerms: true,
        termsVersion: program.termsVersion,
        displayName: displayName.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['creator-me'] });
      router.push('/creator/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not join the Creator Program. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const pitch = (
    <>
      <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-3">Earn by sharing great sales</h1>
      <p className="text-warm-700 dark:text-warm-300 mb-6">
        Share a link to any public sale. When someone follows it and buys, you earn {program.commissionRatePercent}%
        of the platform fee on that purchase, after a {program.holdDays} day hold. It is free to join.
      </p>
      <ul className="space-y-2 mb-8 text-warm-700 dark:text-warm-300">
        <li>A unique creator code and a link for every sale you want to promote.</li>
        <li>A dashboard with real clicks, purchases, and commission status.</li>
        <li>Clear rules: no self-referrals, no fake clicks, always disclose affiliate links.</li>
      </ul>
    </>
  );

  let body: React.ReactNode;
  if (authLoading || (user && meLoading)) {
    body = <p className="text-warm-600 dark:text-warm-400" role="status">Loading...</p>;
  } else if (!user) {
    body = (
      <>
        {pitch}
        <Link
          href={`/login?redirect=${encodeURIComponent('/creator/join')}`}
          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg"
        >
          Sign in to join
        </Link>
        <p className="mt-4 text-sm text-warm-600 dark:text-warm-400">
          New here?{' '}
          <Link href="/register" className="text-amber-700 dark:text-amber-400 underline">
            Create an account
          </Link>
        </p>
      </>
    );
  } else if (me?.suspended) {
    body = (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6">
        <p className="text-red-800 dark:text-red-200 font-semibold mb-2">Creator access suspended</p>
        <p className="text-red-700 dark:text-red-300 text-sm">
          Contact{' '}
          <a href="mailto:support@finda.sale" className="underline">
            support@finda.sale
          </a>{' '}
          for details.
        </p>
      </div>
    );
  } else if (me?.active) {
    body = (
      <>
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-3">You are in the Creator Program</h1>
        <p className="text-warm-700 dark:text-warm-300 mb-6">Head to your dashboard to create links and track results.</p>
        <Link
          href="/creator/dashboard"
          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg"
        >
          Open creator dashboard
        </Link>
      </>
    );
  } else {
    body = (
      <form onSubmit={handleJoin}>
        {pitch}
        {me && !me.emailVerified && (
          <div className="mb-6 rounded-lg border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-4 text-sm text-yellow-800 dark:text-yellow-200">
            Verify your email address to join. Check your inbox for the verification link.
          </div>
        )}
        <label className="block mb-6">
          <span className="block text-sm font-medium text-warm-800 dark:text-warm-200 mb-1">
            Display name (optional)
          </span>
          <input
            type="text"
            value={displayName}
            maxLength={60}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How you want to be known as a creator"
            className="w-full rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </label>
        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-warm-300 dark:border-gray-600 text-amber-600"
          />
          <span className="text-sm text-warm-700 dark:text-warm-300">
            I have read and accept the{' '}
            <Link href="/creator/terms" className="text-amber-700 dark:text-amber-400 underline" target="_blank">
              Creator Program terms
            </Link>{' '}
            (version {program.termsVersion}).
          </span>
        </label>
        {error && (
          <p className="mb-4 text-sm text-red-700 dark:text-red-300" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!accepted || submitting || (me ? !me.emailVerified : false)}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg w-full sm:w-auto"
        >
          {submitting ? 'Joining...' : 'Join the Creator Program'}
        </button>
      </form>
    );
  }

  return (
    <>
      <Head>
        <title>Join the Creator Program | FindA.Sale</title>
        <meta
          name="description"
          content="Share links to public sales on FindA.Sale and earn a commission when shoppers you send make a purchase."
        />
        <link rel="canonical" href="https://finda.sale/creator/join" />
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-12">{body}</div>
      </div>
    </>
  );
};

export default CreatorJoinPage;
