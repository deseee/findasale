/**
 * Weekend sales email signup box (2026-11-26): email + ZIP, double opt-in.
 * POST /api/digest/subscribe (backend routes/weekendDigest.ts). Confirmed signups get the Friday
 * weekend email with sales near their ZIP. Placed on the homepage, city hubs, this-weekend pages and
 * sale pages; `source` tells them apart in analytics.
 */
import React, { useState } from 'react';
import api from '../lib/api';

type Status = 'idle' | 'submitting' | 'success' | 'error';

interface Props {
  /** Where the box is shown (analytics label), e.g. "home", "city", "this-weekend", "sale". */
  source: string;
  /** Prefills the ZIP field (e.g. the sale's ZIP on a sale page). */
  defaultZip?: string | null;
  /** Place name for the heading, e.g. "Paw Paw". */
  placeName?: string | null;
  className?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function track(event: string, params: Record<string, string>) {
  try {
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', event, params);
    }
  } catch {
    // analytics must never break the form
  }
}

export default function WeekendEmailSignup({ source, defaultZip, placeName, className = '' }: Props) {
  const initialZip = defaultZip && /^\d{5}/.test(defaultZip) ? defaultZip.slice(0, 5) : '';
  const [email, setEmail] = useState('');
  const [zip, setZip] = useState(initialZip);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;
    const cleanEmail = email.trim();
    const cleanZip = zip.trim();
    if (!EMAIL_RE.test(cleanEmail)) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }
    if (!/^\d{5}$/.test(cleanZip)) {
      setStatus('error');
      setMessage('Enter a 5-digit ZIP code.');
      return;
    }
    setStatus('submitting');
    setMessage('');
    try {
      const res = await api.post('/digest/subscribe', { email: cleanEmail, zip: cleanZip });
      setMessage(res.data?.message || 'Check your email and tap the link to confirm.');
      setStatus('success');
      track('weekend_email_signup', { source });
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'That did not go through. Check your connection and try again.');
      setStatus('error');
    }
  };

  const heading = placeName ? `Get ${placeName} weekend sales by email` : 'Get weekend sales near you by email';

  return (
    <section
      aria-label="Weekend sales email signup"
      className={`rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-gray-800 p-5 ${className}`}
    >
      <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100">{heading}</h2>
      <p className="mt-1 text-sm text-warm-700 dark:text-warm-300">
        One email every Friday with the garage, estate and yard sales near your ZIP. Free, and you can stop anytime.
      </p>
      {status === 'success' ? (
        <p role="status" className="mt-3 text-sm font-medium text-green-800 dark:text-green-300">
          {message}
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            aria-label="Your email address"
            autoComplete="email"
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-warm-900 dark:text-white placeholder-warm-400"
            required
          />
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="ZIP"
            aria-label="Your ZIP code"
            autoComplete="postal-code"
            className="sm:w-24 px-3 py-2 text-sm border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-warm-900 dark:text-white placeholder-warm-400"
            required
          />
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'submitting' ? 'Sending…' : 'Send me sales'}
          </button>
        </form>
      )}
      {status === 'error' && message && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
      )}
    </section>
  );
}
