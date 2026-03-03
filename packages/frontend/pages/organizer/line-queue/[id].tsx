import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';

interface LineEntry {
  id: string;
  position: number;
  status: 'WAITING' | 'NOTIFIED' | 'ENTERED' | 'CANCELLED';
  notifiedAt: string | null;
  enteredAt: string | null;
  user: {
    name: string;
    phone: string | null;
  };
}

const statusColors: Record<string, string> = {
  WAITING: 'bg-yellow-100 text-yellow-800',
  NOTIFIED: 'bg-blue-100 text-blue-800',
  ENTERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const LineQueuePage = () => {
  const router = useRouter();
  const { id: saleId } = router.query;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [starting, setStarting] = useState(false);
  const [callingNext, setCallingNext] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);

  // Redirect non-organizers
  useEffect(() => {
    if (user && user.role !== 'ORGANIZER' && user.role !== 'ADMIN') {
      router.replace('/');
    }
  }, [user, router]);

  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['line-status', saleId],
    queryFn: async () => {
      if (!saleId) throw new Error('No sale ID');
      const res = await api.get(`/lines/${saleId}/status`);
      return res.data as LineEntry[];
    },
    enabled: !!saleId,
    refetchInterval: 5000, // auto-poll every 5 s
  });

  const waiting = entries.filter(e => e.status === 'WAITING');
  const notified = entries.filter(e => e.status === 'NOTIFIED');
  const entered = entries.filter(e => e.status === 'ENTERED');
  const cancelled = entries.filter(e => e.status === 'CANCELLED');

  const handleStartLine = async () => {
    if (!saleId) return;
    setStarting(true);
    try {
      const res = await api.post(`/lines/${saleId}/start`);
      showToast(`Line started — ${res.data.lineCount} people in queue.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['line-status', saleId] });
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to start line.', 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleCallNext = async () => {
    if (!saleId) return;
    setCallingNext(true);
    try {
      const res = await api.post(`/lines/${saleId}/next`);
      showToast(res.data.message, 'success');
      queryClient.invalidateQueries({ queryKey: ['line-status', saleId] });
    } catch (err: any) {
      showToast(err.response?.data?.message || 'No one is waiting.', 'error');
    } finally {
      setCallingNext(false);
    }
  };

  const handleMarkEntered = async (lineEntryId: string) => {
    setEnteringId(lineEntryId);
    try {
      const res = await api.post(`/lines/entry/${lineEntryId}/entered`);
      showToast(`Marked as entered. ${res.data.waitingCount} still waiting.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['line-status', saleId] });
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to mark as entered.', 'error');
    } finally {
      setEnteringId(null);
    }
  };

  const handleBroadcast = async () => {
    if (!saleId) return;
    setBroadcasting(true);
    try {
      const res = await api.post(`/lines/${saleId}/broadcast`);
      showToast(`SMS sent to ${res.data.smsSent} of ${res.data.totalWaiting} waiting.`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to broadcast.', 'error');
    } finally {
      setBroadcasting(false);
    }
  };

  if (!user || (user.role !== 'ORGANIZER' && user.role !== 'ADMIN')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Line Queue Manager — FindA.Sale</title>
      </Head>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Back link */}
        <Link
          href={saleId ? `/sales/${saleId}` : '/organizer/dashboard'}
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Sale
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Line Queue</h1>
        <p className="text-gray-500 text-sm mb-6">Updates every 5 seconds. SMS is sent automatically when you call next or start the line.</p>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Waiting', count: waiting.length, color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
            { label: 'Notified', count: notified.length, color: 'bg-blue-50 border-blue-200 text-blue-700' },
            { label: 'Entered', count: entered.length, color: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Cancelled', count: cancelled.length, color: 'bg-gray-50 border-gray-200 text-gray-500' },
          ].map(({ label, count, color }) => (
            <div key={label} className={`rounded-lg border p-3 text-center ${color}`}>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={handleStartLine}
            disabled={starting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded"
          >
            {starting ? 'Starting…' : '▶ Start / Reset Line'}
          </button>
          <button
            onClick={handleCallNext}
            disabled={callingNext || waiting.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded"
          >
            {callingNext ? 'Calling…' : `📣 Call Next (${waiting.length} waiting)`}
          </button>
          <button
            onClick={handleBroadcast}
            disabled={broadcasting || waiting.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded"
          >
            {broadcasting ? 'Sending…' : '📱 Broadcast Positions'}
          </button>
        </div>

        {/* Queue table */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading queue…</div>
        ) : isError ? (
          <div className="text-center py-12 text-red-500">Error loading queue. Make sure the line has been started.</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No one in the queue yet. Click <strong>Start / Reset Line</strong> to open the virtual line.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries
                  .filter(e => e.status !== 'CANCELLED')
                  .map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-500">{entry.position}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{entry.user?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{entry.user?.phone || 'No phone'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[entry.status]}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.status === 'NOTIFIED' && (
                        <button
                          onClick={() => handleMarkEntered(entry.id)}
                          disabled={enteringId === entry.id}
                          className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1 rounded"
                        >
                          {enteringId === entry.id ? '…' : '✓ Mark Entered'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cancelled section (collapsed) */}
        {cancelled.length > 0 && (
          <details className="mt-4">
            <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600">
              {cancelled.length} cancelled / left
            </summary>
            <ul className="mt-2 text-sm text-gray-400 pl-4 space-y-1">
              {cancelled.map(e => (
                <li key={e.id}>#{e.position} — {e.user?.name || 'Unknown'}</li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  );
};

export default LineQueuePage;
