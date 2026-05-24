import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import api from '../../lib/api';

interface OutreachOpen {
  emailAddress: string;
  organizerName: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  sentAt: string | null;
  openedAt: string | null;
  touchNumber: number | null;
  status: string | null;
}

export default function OutreachOpensPage() {
  const router = useRouter();
  const [opens, setOpens] = useState<OutreachOpen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/outreach-opens')
      .then(res => setOpens(res.data.opens))
      .catch(err => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          router.push('/login');
        } else {
          setError('Failed to load outreach opens');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      <Head>
        <title>Outreach Opens — Admin | FindA.Sale</title>
      </Head>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <a
            href="/admin"
            className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
          >
            ← Admin
          </a>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Outreach Email Opens
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          {loading ? 'Loading…' : `${opens.length} organizer${opens.length !== 1 ? 's' : ''} opened an outreach email — sorted most recent first.`}
        </p>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        {!loading && opens.length === 0 && !error && (
          <p className="text-gray-500 dark:text-gray-400">No opens recorded yet.</p>
        )}

        {opens.length > 0 && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Organizer</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Location</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Website</th>
                  <th className="text-center px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Touch</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Sent</th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Opened</th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {opens.map((o, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  >
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                      {o.organizerName || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {o.emailAddress}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {[o.city, o.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[180px] truncate">
                      {o.website ? (
                        <a
                          href={o.website.startsWith('http') ? o.website : `https://${o.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {o.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                      {o.touchNumber ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {fmt(o.sentAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-medium whitespace-nowrap">
                      {fmt(o.openedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {o.status ? (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          o.status === 'CLAIMED' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                          o.status === 'BOUNCED' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {o.status}
                        </span>
                      ) : '—'}
                    </td>
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
