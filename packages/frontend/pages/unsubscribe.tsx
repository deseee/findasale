/**
 * Unsubscribe Page
 *
 * Allows users to unsubscribe from email notifications via link.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import Head from 'next/head';

const UnsubscribePage = () => {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (token) {
      unsubscribe();
    }
  }, [token]);

  const unsubscribe = async () => {
    try {
      await api.post('/notifications/unsubscribe-link', { token });
      setStatus('success');
      setMessage('You have been unsubscribed from notifications.');
    } catch (error: any) {
      setStatus('error');
      setMessage(error.response?.data?.message || 'Failed to unsubscribe. Please try again.');
    }
  };

  return (
    <>
      <Head>
        <title>Unsubscribe - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-warm-900 mb-6">Email Preferences</h1>

          {status === 'loading' && (
            <p className="text-warm-600">Processing your request...</p>
          )}

          {status === 'success' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
              <p className="font-medium mb-2">Unsubscribed</p>
              <p className="text-sm">{message}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <p className="font-medium mb-2">Error</p>
              <p className="text-sm">{message}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default UnsubscribePage;
