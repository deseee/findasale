import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';

/**
 * Phase 20: Start a new conversation with an organizer.
 * Reached via: /messages/new?organizerId=XXX&saleId=XXX
 */
const NewMessagePage = () => {
  const router = useRouter();
  const { organizerId, saleId } = router.query as { organizerId?: string; saleId?: string };
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await api.post('/messages', {
        organizerId,
        saleId: saleId || null,
        body: text,
      });
      return res.data as { conversation: { id: string }; message: unknown };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      router.replace(`/messages/${data.conversation.id}`);
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center p-8">
        <Head><title>New Message – FindA.Sale</title></Head>
        <Link href="/login" className="px-6 py-3 bg-amber-600 text-white rounded-lg font-semibold">Log in</Link>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || sendMutation.isPending) return;
    sendMutation.mutate(body.trim());
  };

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head><title>New Message – FindA.Sale</title></Head>

      <main className="container mx-auto px-4 py-8 max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <Link href={saleId ? `/sales/${saleId}` : '/messages'} className="text-warm-500 dark:text-warm-400 hover:text-warm-900 dark:text-warm-100 p-1 -ml-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-warm-900 dark:text-warm-100">Message organizer</h1>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-warm-200 dark:border-gray-700 p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="message-body" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                Your message
              </label>
              <textarea
                id="message-body"
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                placeholder="Ask about items, pickup, or anything else about this sale…"
                className="w-full rounded-xl border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                autoFocus
              />
            </div>
            {sendMutation.isError && (
              <p className="text-red-600 text-sm">Failed to send. Please try again.</p>
            )}
            <button
              type="submit"
              disabled={!body.trim() || sendMutation.isPending}
              className="w-full py-3 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {sendMutation.isPending ? 'Sending…' : 'Send message'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default NewMessagePage;
