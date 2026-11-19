import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import api from '../../lib/api';

// 2026-11-19: weekly organizer signup funnel, outreach email to first published sale.
// Backend: GET /api/admin/signup-funnel (services/signupFunnelService.ts). Read-only.

type Step =
  | 'outreachSent'
  | 'newContacts'
  | 'outreachOpened'
  | 'outreachClicked'
  | 'saleClaimEmailsSent'
  | 'claimsStarted'
  | 'claimsVerified'
  | 'claimsApproved'
  | 'instantClaims'
  | 'organizerSignups'
  | 'signupsFromOutreach'
  | 'firstSalesPublished';

type Week = { weekStart: string } & Record<Step, number>;

interface Funnel {
  timezone: string;
  generatedAt: string;
  weeks: Week[];
  claimQueue: { awaitingReview: number; oldestWaitingSince: string | null };
}

const STEPS: { key: Step; label: string; note?: string; strong?: boolean }[] = [
  { key: 'outreachSent', label: 'Outreach emails sent', note: 'Every touch counts' },
  { key: 'newContacts', label: 'Organizers emailed for the first time' },
  { key: 'outreachOpened', label: 'Opens', note: 'Pixel opens; Apple Mail inflates these' },
  { key: 'outreachClicked', label: 'Clicks' },
  { key: 'saleClaimEmailsSent', label: 'Sale claim emails sent', note: 'Separate mail about one scraped sale' },
  { key: 'claimsStarted', label: 'Claim forms started' },
  { key: 'claimsVerified', label: 'Claim emails verified' },
  { key: 'claimsApproved', label: 'Claims approved' },
  { key: 'instantClaims', label: 'Instant claims', note: 'Signed-in claim, dated by account signup week' },
  { key: 'organizerSignups', label: 'Organizer signups', strong: true },
  { key: 'signupsFromOutreach', label: 'Signups on the outreach list' },
  { key: 'firstSalesPublished', label: 'First sale published', strong: true },
];

const fmtWeek = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function SignupFunnelPage() {
  const router = useRouter();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [weeks, setWeeks] = useState(8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get(`/admin/signup-funnel?weeks=${weeks}`)
      .then((res) => setFunnel(res.data))
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          router.push('/login');
        } else {
          setError('Failed to load the signup funnel');
        }
      })
      .finally(() => setLoading(false));
  }, [router, weeks]);

  const queue = funnel?.claimQueue;

  return (
    <>
      <Head>
        <title>Signup Funnel - Admin - FindA.Sale</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-2">
          <Link href="/admin" className="text-sm text-violet-600 dark:text-violet-400 hover:underline">
            ← Admin
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Weekly signup funnel</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Each step from an outreach email to an organizer&apos;s first published sale, counted in the week it
          happened. Weeks start Monday, Detroit time. Your own and test accounts are left out.
        </p>

        {queue && queue.awaitingReview > 0 && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            {queue.awaitingReview} verified claim{queue.awaitingReview === 1 ? ' is' : 's are'} waiting for approval
            {queue.oldestWaitingSince
              ? `, the oldest since ${new Date(queue.oldestWaitingSince).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : ''}
            .
          </div>
        )}

        <div className="mb-4 flex items-center gap-2 text-sm">
          <label htmlFor="weeks" className="text-gray-600 dark:text-gray-400">
            Weeks
          </label>
          <select
            id="weeks"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1"
          >
            {[4, 8, 12, 26].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {loading && <p className="text-gray-500 dark:text-gray-400">Loading...</p>}
        {error && <p className="text-red-500 mb-4">{error}</p>}

        {funnel && !loading && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Step</th>
                  {funnel.weeks.map((w, i) => (
                    <th
                      key={w.weekStart}
                      className="text-right px-3 py-3 text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap"
                    >
                      {fmtWeek(w.weekStart)}
                      {i === 0 ? ' (so far)' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STEPS.map((s) => (
                  <tr key={s.key} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                      <span className={s.strong ? 'font-semibold' : ''}>{s.label}</span>
                      {s.note && <span className="block text-xs text-gray-500 dark:text-gray-400">{s.note}</span>}
                    </td>
                    {funnel.weeks.map((w) => (
                      <td
                        key={w.weekStart}
                        className={`text-right px-3 py-2 tabular-nums ${
                          w[s.key] === 0
                            ? 'text-gray-400 dark:text-gray-500'
                            : s.strong
                            ? 'font-semibold text-green-700 dark:text-green-400'
                            : 'text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {w[s.key].toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
