/**
 * Shopper Notify Me Alerts Page: /shopper/notify-me
 *
 * Lets a logged-in shopper add, view and remove "Notify me when this is listed" alerts
 * (Feature #455). Each alert is one-shot: when a matching sale or item is listed we email
 * the shopper once, then the alert shows as "Sent" and can be re-armed.
 *
 * Backend: GET/POST/DELETE /api/shopper/waitlist (routes/shopperWaitlist.ts)
 *   POST returns 201 (created), 200 with { rearmed: true } (re-armed), 409 (already waiting)
 * Handles loading, empty, error, dark mode and mobile layouts.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Bell, Trash2, MapPin, CheckCircle2, Clock } from 'lucide-react';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import api from '../../lib/api';

// Local type: never import from @findasale/shared (breaks Vercel build).
interface WaitlistEntry {
  id: string;
  itemType: string;
  city: string | null;
  state: string | null;
  isActive: boolean;
  notifiedAt: string | null;
  createdAt: string;
}

const NotifyMePage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [itemType, setItemType] = useState('');
  const [city, setCity] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const loadEntries = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/shopper/waitlist');
      setEntries(Array.isArray(res.data) ? (res.data as WaitlistEntry[]) : []);
    } catch (err) {
      console.error('Error fetching notify-me alerts:', err);
      setError('Unable to load your alerts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdding) return;
    const trimmed = itemType.trim();
    if (trimmed.length < 2) {
      setFormError('Tell us what you are looking for (at least 2 characters).');
      return;
    }
    setIsAdding(true);
    setFormError(null);
    try {
      const body: { itemType: string; city?: string } = { itemType: trimmed };
      if (city.trim()) body.city = city.trim();
      const res = await api.post('/shopper/waitlist', body);
      showToast(
        res.data?.rearmed ? 'Alert turned back on. We will email you at the next match.' : 'Alert added. We will email you when a match is listed.',
        'success'
      );
      setItemType('');
      setCity('');
      await loadEntries();
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message;
      if (status === 409) {
        setFormError('You already have an alert for that. It is listed below.');
      } else {
        setFormError(message || 'Could not add that alert. Please try again.');
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await api.delete(`/shopper/waitlist/${id}`);
      setEntries((prev) => prev.filter((x) => x.id !== id));
      showToast(`Removed alert for "${label}"`, 'success');
    } catch (err) {
      console.error('Error deleting notify-me alert:', err);
      showToast('Could not remove that alert. Please try again.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (!user && !authLoading) return null;

  return (
    <>
      <Head>
        <title>Notify Me Alerts | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-white dark:bg-gray-900">
        <div className="bg-gradient-to-r from-amber-50 to-amber-50/50 dark:from-gray-800 dark:to-gray-900 py-12 px-4">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
              <Bell className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              Notify Me Alerts
            </h1>
            <p className="text-lg text-gray-700 dark:text-gray-300">
              Tell us what you are hunting for. We email you once when a matching sale or item is listed.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
          {/* Add form */}
          <form
            onSubmit={handleAdd}
            className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
            aria-label="Add a Notify Me alert"
          >
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Add an alert</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label htmlFor="notify-item-type" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  What are you looking for?
                </label>
                <input
                  id="notify-item-type"
                  type="text"
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. mid century lamp"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>
              <div className="sm:w-48">
                <label htmlFor="notify-city" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  City (optional)
                </label>
                <input
                  id="notify-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. Grand Rapids"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>
              <div className="sm:self-end">
                <button
                  type="submit"
                  disabled={isAdding}
                  className="w-full sm:w-auto px-5 py-2 min-h-[40px] bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAdding ? 'Adding...' : 'Add alert'}
                </button>
              </div>
            </div>
            {formError && (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}
          </form>

          {/* List */}
          {authLoading || isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : error ? (
            <EmptyState
              icon="⚠️"
              heading="Unable to load your alerts"
              subtext="Something went wrong fetching your alerts. Please try again in a moment."
              cta={{ label: 'Try again', onClick: loadEntries }}
            />
          ) : entries.length === 0 ? (
            <EmptyState
              icon="🔔"
              heading="No alerts yet"
              subtext="Add what you are looking for above, or search for it and tap Notify Me when nothing turns up."
              cta={{ label: 'Start Searching', href: '/search' }}
            />
          ) : (
            <ul className="space-y-4">
              {entries.map((entry) => {
                const where = [entry.city, entry.state].filter(Boolean).join(', ');
                const sent = !!entry.notifiedAt;
                return (
                  <li
                    key={entry.id}
                    className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{entry.itemType}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {where && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-4 h-4" aria-hidden="true" />
                            {where}
                          </span>
                        )}
                        {sent ? (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                            Alert sent {new Date(entry.notifiedAt as string).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-4 h-4" aria-hidden="true" />
                            Waiting since {new Date(entry.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link
                        href={`/search?q=${encodeURIComponent(entry.itemType)}`}
                        className="inline-flex items-center px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                      >
                        Search now
                      </Link>
                      <button
                        onClick={() => handleDelete(entry.id, entry.itemType)}
                        disabled={deletingId === entry.id}
                        aria-label={`Remove alert for ${entry.itemType}`}
                        className="inline-flex items-center justify-center p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};

export default NotifyMePage;
