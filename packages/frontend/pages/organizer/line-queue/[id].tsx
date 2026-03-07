/**
 * Virtual Line Queue Manager — Sprint T4
 * Real-time organizer view of the virtual line for a sale.
 * Replaces placeholder that called a non-existent /sales/:id/queue endpoint.
 *
 * Features:
 *  - Waiting / Notified / Entered breakdown
 *  - "Call Next" — SMS the next person in line
 *  - "Notify All" — position update SMS blast to all waiting shoppers
 *  - "Mark as Entered" per person
 *  - Auto-polls every 10 seconds
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import api from '../../../lib/api';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Layout from '../../../components/Layout';

interface LineEntry {
  id: string;
  position: number;
  status: 'WAITING' | 'NOTIFIED' | 'ENTERED' | 'CANCELLED';
  notifiedAt: string | null;
  enteredAt: string | null;
  user: { name: string; phone: string | null };
}

const STATUS_LABEL: Record<LineEntry['status'], string> = {
  WAITING: 'Waiting',
  NOTIFIED: 'Notified',
  ENTERED: 'Entered',
  CANCELLED: 'Left',
};
const STATUS_COLOR: Record<LineEntry['status'], string> = {
  WAITING: 'bg-amber-50 text-amber-800',
  NOTIFIED: 'bg-blue-50 text-blue-800',
  ENTERED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-warm-100 text-warm-500',
};

const LineQueuePage = () => {
  const router = useRouter();
  const { id: saleId } = router.query as { id: string };
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [entries, setEntries] = useState<LineEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const loadStatus = useCallback(async () => {
    if (!saleId) return;
    try {
      const res = await api.get(`/lines/${saleId}/status`);
      setEntries(res.data);
    } catch {
      // Silently ignore poll errors
    } finally {
      setIsLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleAction = async (
    label: string,
    apiCall: () => Promise<any>,
    successMsg: string
  ) => {
    setActionLoading(label);
    try {
      await apiCall();
      showToast(successMsg, 'success');
      await loadStatus();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? `Failed: ${label}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const waiting = entries.filter(e => e.status === 'WAITING');
  const notified = entries.filter(e => e.status === 'NOTIFIED');
  const entered = entries.filter(e => e.status === 'ENTERED');
  const active = entries.filter(e => e.status !== 'CANCELLED');

  return (
    <Layout>
      <Head>
        <title>Virtual Line Manager – FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link href="/organizer/dashboard" className="text-warm-500 hover:text-warm-700 p-2 rounded hover:bg-warm-100" aria-label="Go back">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-warm-900">Virtual Line</h1>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="card p-4 text-center">
              <p className="text-3xl font-bold text-amber-700">{waiting.length}</p>
              <p className="text-xs text-warm-500 mt-1">Waiting</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-3xl font-bold text-blue-700">{notified.length}</p>
              <p className="text-xs text-warm-500 mt-1">Notified</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-3xl font-bold text-green-700">{entered.length}</p>
              <p className="text-xs text-warm-500 mt-1">Entered</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mb-6">
            <button
              disabled={waiting.length === 0 || actionLoading !== null}
              onClick={() => handleAction(
                'callNext',
                () => api.post(`/lines/${saleId}/next`),
                'Next person notified via SMS'
              )}
              className="flex-1 bg-amber-600 text-white py-3 rounded-xl font-semibold disabled:opacity-40 hover:bg-amber-700 transition-colors"
            >
              {actionLoading === 'callNext' ? 'Sending…' : `Call Next #${waiting[0]?.position ?? '–'}`}
            </button>
            <button
              disabled={waiting.length === 0 || actionLoading !== null}
              onClick={() => handleAction(
                'notifyAll',
                () => api.post(`/lines/${saleId}/notify`),
                `Position update sent to ${waiting.length} shopper${waiting.length !== 1 ? 's' : ''}`
              )}
              className="flex-1 bg-white border border-warm-300 text-warm-800 py-3 rounded-xl font-semibold disabled:opacity-40 hover:bg-warm-50 transition-colors"
            >
              {actionLoading === 'notifyAll' ? 'Sending…' : 'Notify All'}
            </button>
          </div>

          {isLoading && (
            <div className="text-center text-warm-500 py-10">Loading line…</div>
          )}

          {!isLoading && active.length === 0 && (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🏁</p>
              <p className="text-warm-600 font-medium">No one in line yet.</p>
              <p className="text-warm-500 text-sm mt-1">Shoppers can join via the sale page.</p>
            </div>
          )}

          {!isLoading && active.length > 0 && (
            <div className="space-y-3">
              {active.map(entry => (
                <div key={entry.id} className="card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-amber-800 text-sm">#{entry.position}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-warm-900 truncate">{entry.user.name}</p>
                    <p className="text-xs text-warm-500">
                      {entry.user.phone ?? 'No phone — cannot SMS'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLOR[entry.status]}`}>
                      {STATUS_LABEL[entry.status]}
                    </span>
                    {(entry.status === 'WAITING' || entry.status === 'NOTIFIED') && (
                      <button
                        disabled={actionLoading !== null}
                        onClick={() => handleAction(
                          `enter-${entry.id}`,
                          () => api.post(`/lines/entry/${entry.id}/entered`),
                          `${entry.user.name} marked as entered`
                        )}
                        className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
                      >
                        {actionLoading === `enter-${entry.id}` ? '…' : 'Entered ✓'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
};

export default LineQueuePage;
