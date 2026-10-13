import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import api from '../../lib/api';

// ADR-139: public double-opt-in interest form for organizers. Copy: sales-ops review 2026-10-12 §1.

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const ALLOWED_SRC = ['profile', 'claim_page', 'claim_email', 'city', 'other'];

type Phase = 'loading' | 'closed' | 'form' | 'submitting' | 'done';

export default function RecruitInterestPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [state, setState] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    const name = typeof router.query.name === 'string' ? router.query.name.slice(0, 120) : '';
    if (name) setBusinessName(name);
    let cancelled = false;
    api
      .get('/recruit/status')
      .then((res) => { if (!cancelled) setPhase(res.data?.open ? 'form' : 'closed'); })
      .catch(() => { if (!cancelled) setPhase('closed'); });
    return () => { cancelled = true; };
  }, [router.isReady, router.query.name]);

  const src = typeof router.query.src === 'string' && ALLOWED_SRC.includes(router.query.src) ? router.query.src : undefined;
  const org = typeof router.query.org === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(router.query.org) ? router.query.org : undefined;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!consent) {
      setError('Please tick the box so we know you want to hear from us.');
      return;
    }
    setPhase('submitting');
    try {
      const res = await api.post('/recruit/interest', {
        email: email.trim(),
        businessName: businessName.trim(),
        ...(state ? { state } : {}),
        consent: true,
        website,
        ...(src ? { src } : {}),
        ...(org ? { org } : {}),
      });
      setDoneMessage(res.data?.message || 'Please check your inbox for a confirmation link.');
      setPhase('done');
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 503) { setPhase('closed'); return; }
      if (status === 429) setError('Too many tries from this connection. Please try again in an hour.');
      else if (status === 400) setError('Please check your email address and business name, then try again.');
      else setError('Something went wrong on our side. Please try again later.');
      setPhase('form');
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-amber-500';

  return (
    <>
      <Head>
        <title>Get Set Up on FindA.Sale</title>
        <meta name="description" content="Run sales? Get a short getting-started guide for listing your sales on FindA.Sale. Free to list." />
        <meta name="robots" content="noindex" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-warm-50 to-warm-100 dark:from-gray-900 dark:to-gray-800 flex items-start sm:items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8">
          {phase === 'loading' && (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400" role="status">Loading...</div>
          )}

          {phase === 'closed' && (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Run sales? Get set up on FindA.Sale.</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Our email guide is not available right now. You can create a free account and list your next sale today. No card needed.
              </p>
              <Link
                href="/register?role=organizer"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Create a free account
              </Link>
            </div>
          )}

          {phase === 'done' && (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Check your email</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{doneMessage}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Nothing else is sent until you click the confirmation link. Ready now?{' '}
                <Link href="/register?role=organizer" className="text-amber-600 dark:text-amber-400 underline">
                  Create a free account
                </Link>
                .
              </p>
            </div>
          )}

          {(phase === 'form' || phase === 'submitting') && (
            <form onSubmit={onSubmit} noValidate>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Run sales? Get set up on FindA.Sale.</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Tell us where to send a short getting-started guide. Free to list. No card needed.
              </p>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="recruit-email">Email</label>
              <input
                id="recruit-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} mb-4`}
              />

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="recruit-business">Business name</label>
              <input
                id="recruit-business"
                type="text"
                autoComplete="organization"
                required
                maxLength={120}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className={`${inputClass} mb-4`}
              />

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="recruit-state">State (US only)</label>
              <select id="recruit-state" value={state} onChange={(e) => setState(e.target.value)} className={`${inputClass} mb-4`}>
                <option value="">Choose a state</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Honeypot: hidden from people, filled by bots. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label htmlFor="recruit-website">Website</label>
                <input id="recruit-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>

              <label className="flex items-start gap-3 mb-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 h-5 w-5 flex-shrink-0 rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Yes, send me information about listing my sales on FindA.Sale. Unsubscribe at any time.
                </span>
              </label>

              {error && (
                <p className="mb-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={phase === 'submitting' || !email.trim() || !businessName.trim()}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
              >
                {phase === 'submitting' ? 'Sending...' : 'Send me the guide'}
              </button>

              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                We will email you once to confirm. Nothing else is sent until you click that link. The FindA.Sale Team.
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
