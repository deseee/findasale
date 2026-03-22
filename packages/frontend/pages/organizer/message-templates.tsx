import React, { useState } from 'react';
import Head from 'next/head';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useRouter } from 'next/router';
import Link from 'next/link';

interface Template {
  id: string;
  title: string;
  body: string;
  category: string;
  usageCount: number;
}

const CATEGORIES = ['general', 'pricing', 'pickup', 'availability'];

export default function TemplatesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState({ title: '', body: '', category: 'general' });
  const [isAdding, setIsAdding] = useState(false);

  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  const { data } = useQuery({
    queryKey: ['message-templates'],
    queryFn: () => api.get('/message-templates').then(r => r.data),
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof editData }) => api.put(`/message-templates/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['message-templates'] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/message-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['message-templates'] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof editData) => api.post('/message-templates', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['message-templates'] }); setIsAdding(false); setEditData({ title: '', body: '', category: 'general' }); },
  });

  const templates: Template[] = data?.templates || [];

  return (
    <>
      <Head><title>Quick Reply Templates — FindA.Sale</title></Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-warm-900 dark:text-gray-100">⚡ Quick Reply Templates</h1>
              <p className="text-warm-600 dark:text-gray-400 text-sm mt-1">Canned responses for common shopper questions</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsAdding(true)} className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition">
                + New Template
              </button>
              <Link href="/organizer/dashboard" className="bg-warm-200 hover:bg-warm-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 font-bold py-2 px-4 rounded-lg text-sm transition">
                Back
              </Link>
            </div>
          </div>

          {isAdding && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6 border-2 border-amber-200 dark:border-amber-800">
              <h3 className="font-semibold text-warm-900 dark:text-gray-100 mb-4">New Template</h3>
              <div className="space-y-3">
                <input type="text" value={editData.title} onChange={e => setEditData(d => ({ ...d, title: e.target.value }))} placeholder="Template name (e.g. Pickup Hours)" className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white dark:bg-gray-700 dark:text-gray-100" />
                <select value={editData.category} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))} className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white dark:bg-gray-700 dark:text-gray-100">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
                <textarea value={editData.body} onChange={e => setEditData(d => ({ ...d, body: e.target.value }))} rows={4} placeholder="Response text..." className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-white dark:bg-gray-700 dark:text-gray-100" />
                <div className="flex gap-2">
                  <button onClick={() => createMutation.mutate(editData)} disabled={!editData.title || !editData.body || createMutation.isPending} className="bg-amber-600 text-white font-semibold py-2 px-4 rounded-lg text-sm disabled:opacity-50">Save</button>
                  <button onClick={() => setIsAdding(false)} className="bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg text-sm">Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
                {editing === t.id ? (
                  <div className="space-y-3">
                    <input type="text" value={editData.title} onChange={e => setEditData(d => ({ ...d, title: e.target.value }))} className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white dark:bg-gray-700 dark:text-gray-100" />
                    <select value={editData.category} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))} className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white dark:bg-gray-700 dark:text-gray-100">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                    <textarea value={editData.body} onChange={e => setEditData(d => ({ ...d, body: e.target.value }))} rows={4} className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-white dark:bg-gray-700 dark:text-gray-100" />
                    <div className="flex gap-2">
                      <button onClick={() => updateMutation.mutate({ id: t.id, data: editData })} disabled={updateMutation.isPending} className="bg-amber-600 text-white font-semibold py-2 px-4 rounded-lg text-sm disabled:opacity-50">Save</button>
                      <button onClick={() => setEditing(null)} className="bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-warm-900 dark:text-gray-100">{t.title}</p>
                        <span className="text-xs bg-warm-100 dark:bg-gray-700 text-warm-600 dark:text-warm-300 px-2 py-0.5 rounded-full">{t.category}</span>
                        {t.usageCount > 0 && <span className="text-xs text-warm-400 dark:text-warm-500">Used {t.usageCount}x</span>}
                      </div>
                      <p className="text-sm text-warm-600 dark:text-gray-300">{t.body}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => { setEditing(t.id); setEditData({ title: t.title, body: t.body, category: t.category }); }} className="text-xs text-amber-600 hover:underline font-medium">Edit</button>
                      <button onClick={() => deleteMutation.mutate(t.id)} className="text-xs text-red-500 hover:underline font-medium">Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {templates.length === 0 && !isAdding && (
            <div className="text-center py-12 text-warm-500 dark:text-gray-400">No templates yet. Add your first one above.</div>
          )}
        </div>
      </div>
    </>
  );
}
