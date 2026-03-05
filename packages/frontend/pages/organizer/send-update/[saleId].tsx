/**
 * Send Sale Update
 *
 * Allows organizers to send notifications to interested shoppers.
 * Sends via email and SMS to subscribed users.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../../lib/api';
import { useToast } from '../../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

const SendUpdatePage = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { showToast } = useToast();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      showToast('Message cannot be empty', 'error');
      return;
    }

    setIsSending(true);
    try {
      await api.post(`/notifications/send-update/${saleId}`, { message });
      showToast('Update sent to subscribers', 'success');
      setMessage('');
      router.push('/organizer/dashboard');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to send update', 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Head>
        <title>Send Sale Update - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block">
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 mb-8">Send Sale Update</h1>
          <p className="text-warm-600 mb-6">Notify all subscribers about your sale.</p>

          <form onSubmit={handleSend} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={500}
                className="w-full px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                placeholder="What would you like to tell your subscribers?"
              />
              <p className="text-xs text-warm-500 mt-1">{message.length}/500</p>
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
            >
              {isSending ? 'Sending...' : 'Send Update'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default SendUpdatePage;
