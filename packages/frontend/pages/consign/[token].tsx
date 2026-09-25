/**
 * Consignor Self-Serve Intake — public request form (2026-09-25)
 *
 * PUBLIC page (NO AUTH REQUIRED)
 * Accessible via the workspace's persistent intake link: /consign/:token
 *
 * Deliberately does NOT let a prospective consignor touch inventory/uploads -- this is a
 * single free-text "what are you thinking of bringing?" note, never structured items or
 * photos. Submitting creates a ConsignorIntakeRequest that sits in the organizer's Requests
 * queue until they approve or decline it -- nothing here creates a real Consignor record.
 * Modeled loosely on pages/consignor/portal/[token].tsx (same no-auth, token-gated shape).
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';

interface IntakeInfo {
  organizerBusinessName: string;
  acceptingRequests: boolean;
}

const apiBase = () => process.env.NEXT_PUBLIC_API_URL || '/api';

const ConsignorIntakePage: React.FC = () => {
  const router = useRouter();
  const { token } = router.query;

  const [info, setInfo] = useState<IntakeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [requestedStartsAt, setRequestedStartsAt] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;

    const fetchInfo = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get(`${apiBase()}/consignor-intake/${token}`);
        setInfo(response.data);
      } catch (err: any) {
        console.error('Error fetching intake link info:', err);
        setError(err.response?.data?.error || 'This link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim()) {
      setSubmitError('Please enter your name.');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setSubmitError('Please enter an email or phone number so the organizer can reach you.');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${apiBase()}/consignor-intake/${token}/submit`, {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        message: message.trim() || undefined,
        requestedStartsAt: requestedStartsAt || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      console.error('Error submitting intake request:', err);
      setSubmitError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Loading... | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
          <p className="text-warm-600 dark:text-warm-400">Loading...</p>
        </div>
      </>
    );
  }

  if (error || !info) {
    return (
      <>
        <Head>
          <title>Link Not Found | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
            <h1 className="text-xl font-bold text-warm-900 dark:text-white mb-2">
              Link Not Found
            </h1>
            <p className="text-warm-600 dark:text-warm-400 text-sm">
              {error || 'This link is invalid or has expired.'}
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!info.acceptingRequests) {
    return (
      <>
        <Head>
          <title>{info.organizerBusinessName} | FindA.Sale</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
            <h1 className="text-xl font-bold text-warm-900 dark:text-white mb-2">
              Not Accepting Requests Right Now
            </h1>
            <p className="text-warm-600 dark:text-warm-400 text-sm">
              {info.organizerBusinessName} isn't accepting consignment requests through this link
              at the moment. Please check back later.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (submitted) {
    return (
      <>
        <Head>
          <title>Request Sent | FindA.Sale</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-warm-900 dark:text-white mb-2">
              Request Sent
            </h1>
            <p className="text-warm-600 dark:text-warm-400 text-sm">
              {info.organizerBusinessName} will review your request and get in touch.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Bring Items In | {info.organizerBusinessName}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 py-8">
        <div className="max-w-md mx-auto">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-warm-900 dark:text-white mb-1">
              Bring Items In
            </h1>
            <p className="text-warm-600 dark:text-warm-400">
              Request to consign with <span className="font-bold text-amber-600 dark:text-amber-400">{info.organizerBusinessName}</span>
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  required
                  aria-label="Name"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  aria-label="Email"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  aria-label="Phone"
                />
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Provide an email or phone so {info.organizerBusinessName} can reach you.
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  What are you thinking of bringing? (optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="A quick note is plenty -- no need for a full list"
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  aria-label="What are you thinking of bringing?"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Preferred drop-off time (optional)
                </label>
                <input
                  type="datetime-local"
                  value={requestedStartsAt}
                  onChange={(e) => setRequestedStartsAt(e.target.value)}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  aria-label="Preferred drop-off time"
                />
              </div>

              {submitError && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-4">{submitError}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                {submitting ? 'Sending...' : 'Send Request'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConsignorIntakePage;
