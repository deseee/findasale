/**
 * X1: Organizer Webhooks Page
 * Register, edit, and delete webhook endpoints (Zapier, Make, custom).
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

const ALL_EVENTS = [
  { value: 'bid.placed',          label: 'Bid placed' },
  { value: 'purchase.completed',  label: 'Purchase completed' },
  { value: 'sale.published',      label: 'Sale published' },
  { value: 'sale.ended',          label: 'Sale ended' },
  { value: 'item.sold',           label: 'Item sold' },
  { value: 'bounty.created',      label: 'Missing-item request submitted' },
];

type Webhook = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: string;
};

const OrganizerWebhooksPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>(['purchase.completed']);
  const [newSecret, setNewSecret] = useState<string | null>(null); // shown once after create

  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const { data: webhooks = [], isLoading } = useQuery<Webhook[]>({
    queryKey: ['webhooks'],
    queryFn: async () => (await api.get('/webhooks')).data,
    enabled: !!user?.id,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/webhooks', { url: newUrl, events: newEvents }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setNewSecret(res.data.secret);
      setNewUrl('');
      setNewEvents(['purchase.completed']);
      setShowForm(false);
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Failed to create webhook', 'error'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/webhooks/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
    onError: (err: any) => showToast(err.response?.data?.message || 'Failed to update', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      showToast('Webhook deleted', 'success');
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Failed to delete', 'error'),
  });

  const toggleEvent = (ev: string) => {
    setNewEvents(prev =>
      prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
    );
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;

  return (
    <>
      <Head><title>Webhooks - FindA.Sale</title></Head>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-lg font-semibold text-gray-900">Webhooks</h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {/* Intro */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            <p>Send real-time event notifications to Zapier, Make, or any custom URL.
            Each request is signed with <code className="font-mono bg-blue-100 px-1 rounded">X-FindASale-Signature</code> (HMAC-SHA256).</p>
            <p className="mt-2">
              New to webhooks?{' '}
              <Link href="/guide#zapier-webhooks" className="underline font-medium hover:text-blue-900">
                Read the Zapier integration guide →
              </Link>
            </p>
          </div>

          {/* Secret revealed once */}
          {newSecret && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-green-900 mb-1">Webhook created — save your secret now</p>
              <p className="text-xs text-green-700 mb-2">This is the only time it will be shown.</p>
              <code className="block font-mono text-xs bg-white border border-green-200 rounded px-3 py-2 break-all select-all">
                {newSecret}
              </code>
              <button
                onClick={() => setNewSecret(null)}
                className="mt-2 text-xs text-green-700 hover:underline"
              >
                I've saved it, dismiss
              </button>
            </div>
          )}

          {/* Existing webhooks */}
          {isLoading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : webhooks.length === 0 && !showForm ? (
            <p className="text-gray-500 text-sm">No webhooks yet.</p>
          ) : (
            <div className="space-y-3">
              {webhooks.map(hook => (
                <div key={hook.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{hook.url}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Secret: <span className="font-mono">{hook.secret}</span>
                        {' · '}{hook.events.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleMutation.mutate({ id: hook.id, isActive: !hook.isActive })}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          hook.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {hook.isActive ? 'Active' : 'Paused'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this webhook?')) deleteMutation.mutate(hook.id);
                        }}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add webhook form */}
          {showForm ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">New webhook</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Events to listen for</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_EVENTS.map(ev => (
                    <label key={ev.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newEvents.includes(ev.value)}
                        onChange={() => toggleEvent(ev.value)}
                        className="accent-blue-600"
                      />
                      {ev.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !newUrl || newEvents.length === 0}
                  className="bg-blue-600 text-white text-sm font-medium py-2 px-5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create webhook'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-sm text-gray-500 py-2 px-4 rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-3 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Add webhook
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerWebhooksPage;
