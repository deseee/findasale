/**
 * Admin: organizer activation nudges (2026-10-23).
 * Log of every activation email (sent or skipped as suppressed) and a dry run of what the next daily
 * organizerOnboardingDrip run would do. Loading this page never sends anything.
 * Backend: GET /api/admin/activation-nudges (controllers/adminActivationNudgesController.ts).
 */
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import api from '../../lib/api';

type State = 'EMPTY_PUBLISHED' | 'DRAFT_UNPUBLISHED' | 'STALE_DATES';

interface LogRow {
  id: string;
  sentAt: string;
  email: string | null;
  name: string | null;
  state: State | null;
  outcome: 'sent' | 'suppressed' | null;
  saleId: string | null;
  saleTitle: string | null;
  saleStatus: string | null;
  automationKey: string;
}

interface PreviewRow {
  state: State;
  decision: 'send' | 'skip';
  reason: string;
  saleId: string;
  saleTitle: string;
  saleStatus: string;
  endDate: string | null;
  itemCount: number;
  email: string;
  name: string | null;
}

interface Payload {
  bulkEmailEnabled: boolean;
  log: LogRow[];
  preview: PreviewRow[];
  wouldSendByState: Record<string, number>;
}

const STATE_LABEL: Record<string, string> = {
  EMPTY_PUBLISHED: 'Live, no items',
  DRAFT_UNPUBLISHED: 'Draft with items',
  STALE_DATES: 'Dates passed',
};

const REASON_LABEL: Record<string, string> = {
  will_send: 'Will send',
  never_email_address: 'Test or placeholder address',
  already_nudged_this_state: 'Already nudged for this',
  rate_limited_7d: 'Emailed in the last 7 days',
  one_email_per_run: 'Another nudge goes first',
  suppressed: 'Unsubscribed or bounced',
};

const th = 'text-left px-3 py-2 text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap';
const td = 'px-3 py-2 text-gray-900 dark:text-gray-100 align-top';

export default function ActivationNudgesPage() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api
      .get('/admin/activation-nudges')
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) router.push('/login');
        else setError("Couldn't load activation nudges.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'N/A';

  const willSend = data?.preview.filter((p) => p.decision === 'send') ?? [];

  return (
    <>
      <Head>
        <title>Activation Nudges. Admin | FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Link href="/admin" className="text-sm text-violet-600 dark:text-violet-400 hover:underline">
            ← Admin
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Organizer activation nudges</h1>
          <p className="mt-1 mb-6 text-sm text-gray-500 dark:text-gray-400">
            One email per sale per state (live with no items, draft with items, dates passed), at most one per organizer
            every 7 days, sent daily at 11:00 UTC. This page only reads; it never sends.
          </p>

          {error && (
            <div className="mb-4 flex items-center gap-3">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button type="button" onClick={load} className="min-h-[44px] px-3 text-sm underline text-gray-700 dark:text-gray-300">
                Try again
              </button>
            </div>
          )}
          {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}

          {data && (
            <>
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-white dark:bg-gray-800 shadow p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Daily job</p>
                  <p className={`text-lg font-semibold ${data.bulkEmailEnabled ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {data.bulkEmailEnabled ? 'On' : 'Off (BULK_EMAIL_ENABLED)'}
                  </p>
                </div>
                {(['EMPTY_PUBLISHED', 'DRAFT_UNPUBLISHED', 'STALE_DATES'] as State[]).map((s) => (
                  <div key={s} className="rounded-lg bg-white dark:bg-gray-800 shadow p-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Next run: {STATE_LABEL[s]}</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{data.wouldSendByState[s] ?? 0}</p>
                  </div>
                ))}
              </div>

              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Next run (dry run)</h2>
              {data.preview.length === 0 ? (
                <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">No organizer qualifies for a nudge right now.</p>
              ) : (
                <div className="mb-8 bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <th className={th}>Organizer</th>
                        <th className={th}>Sale</th>
                        <th className={th}>State</th>
                        <th className={th}>Items</th>
                        <th className={th}>Ends</th>
                        <th className={th}>Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {data.preview.map((p) => (
                        <tr key={`${p.state}:${p.saleId}`}>
                          <td className={td}>
                            <span className="block">{p.name || 'N/A'}</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 break-all">{p.email}</span>
                          </td>
                          <td className={td}>
                            <span className="block">{p.saleTitle}</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">{p.saleStatus}</span>
                          </td>
                          <td className={td}>{STATE_LABEL[p.state] ?? p.state}</td>
                          <td className={td}>{p.itemCount}</td>
                          <td className={td}>{fmt(p.endDate)}</td>
                          <td className={td}>
                            <span className={p.decision === 'send' ? 'font-semibold text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}>
                              {REASON_LABEL[p.reason] ?? p.reason}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {willSend.length} of {data.preview.length} would be emailed on the next run.
                  </p>
                </div>
              )}

              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Log</h2>
              {data.log.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No activation nudges logged yet.</p>
              ) : (
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <th className={th}>When</th>
                        <th className={th}>Organizer</th>
                        <th className={th}>Sale</th>
                        <th className={th}>State</th>
                        <th className={th}>Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {data.log.map((r) => (
                        <tr key={r.id}>
                          <td className={`${td} whitespace-nowrap`}>{fmt(r.sentAt)}</td>
                          <td className={td}>
                            <span className="block">{r.name || 'N/A'}</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 break-all">{r.email}</span>
                          </td>
                          <td className={td}>
                            <span className="block">{r.saleTitle || r.saleId || 'N/A'}</span>
                            {r.saleStatus && <span className="block text-xs text-gray-500 dark:text-gray-400">{r.saleStatus}</span>}
                          </td>
                          <td className={td}>{r.state ? STATE_LABEL[r.state] ?? r.state : 'N/A'}</td>
                          <td className={td}>{r.outcome === 'suppressed' ? 'Not sent (unsubscribed or bounced)' : 'Sent'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
