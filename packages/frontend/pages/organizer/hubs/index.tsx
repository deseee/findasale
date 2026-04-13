/**
 * Flea Market Events — Organizer Hub Dashboard
 *
 * Feature #40 repurposed per ADR-014: Sale Hubs → Flea Market Events (TEAMS tier)
 * Route: /organizer/hubs
 * 4 event types: FLEA_MARKET, ANTIQUE_MALL, POPUP_MARKET, FARMERS_MARKET
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';
import TierGate from '../../../components/TierGate';
import api from '../../../lib/api';

interface HubEvent {
  id: string;
  name: string;
  slug: string;
  saleDate?: string;
  eventName?: string;
  saleCount: number;
}

const EVENT_TYPES = [
  {
    key: 'FLEA_MARKET',
    title: 'Flea Market',
    description: 'Classic multi-vendor outdoor/indoor market',
    icon: '🏪',
    color: 'amber',
  },
  {
    key: 'ANTIQUE_MALL',
    title: 'Antique Mall',
    description: 'Curated antique and vintage dealer showcase',
    icon: '🏛️',
    color: 'warm',
  },
  {
    key: 'POPUP_MARKET',
    title: 'Popup Market',
    description: 'Temporary themed market events',
    icon: '🎪',
    color: 'sage',
  },
  {
    key: 'FARMERS_MARKET',
    title: 'Farmers Market',
    description: 'Local produce and artisan goods market',
    icon: '🌽',
    color: 'green',
  },
];

export default function FleaMarketEventsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await api.get('/hubs/my');
        const data = res.data;
        setEvents(data?.hubs || []);
      } catch (err: any) {
        // Gracefully handle JSON parse errors or missing endpoints
        console.warn('[hubs] Failed to fetch events:', err?.message);
        setEvents([]);
        // Only show error if it's not a parse/404 issue
        if (err?.response?.status && err.response.status !== 404) {
          setEventsError('Unable to load events. The feature is being updated.');
        }
      } finally {
        setEventsLoading(false);
      }
    };

    if (user) {
      fetchEvents();
    }
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
      </div>
    );
  }

  if (!user?.roles?.includes('ORGANIZER')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-4">Access Denied</h1>
          <p className="text-warm-600 dark:text-gray-400 mb-6">You must be an organizer to manage events.</p>
          <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Market Hubs - FindA.Sale</title>
        <meta name="description" content="Organize multi-vendor market events" />
      </Head>

      <TierGate requiredTier="TEAMS" featureName="Market Hubs" description="Organize multi-vendor events like flea markets, antique malls, popup markets, and farmers markets.">
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4 mb-8">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center gap-3 mb-1">
                <Link
                  href="/organizer/dashboard"
                  className="text-warm-400 hover:text-warm-600 dark:text-gray-400 dark:hover:text-gray-300 text-sm"
                >
                  ← Dashboard
                </Link>
                <span className="text-warm-300 dark:text-gray-600">/</span>
                <h1 className="text-lg font-semibold text-warm-900 dark:text-gray-100">
                  Market Hubs
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                  Work in progress
                </span>
              </div>
              <p className="text-sm text-warm-600 dark:text-gray-400">
                Organize multi-vendor events — flea markets, antique malls, popup markets, and farmers markets
              </p>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-4 pb-12">
            {/* Event Type Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {EVENT_TYPES.map((type) => (
                <div
                  key={type.key}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-5 hover:border-amber-300 dark:hover:border-amber-600 transition-colors"
                >
                  <div className="text-3xl mb-3">{type.icon}</div>
                  <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100 mb-1">
                    {type.title}
                  </h3>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    {type.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Create Event CTA */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-1">
                    Ready to host a multi-vendor event?
                  </h2>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Event creation is coming in Phase 2. You&apos;ll be able to set up booths, invite vendors, and manage payouts — all from one dashboard.
                  </p>
                </div>
                <button
                  disabled
                  className="px-6 py-2.5 bg-amber-600/50 text-white rounded-lg font-semibold cursor-not-allowed"
                >
                  Create Event — Coming Soon
                </button>
              </div>
            </div>

            {/* Features Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6 mb-8">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">
                What&apos;s coming
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm font-medium text-warm-900 dark:text-gray-100 mb-1">Unlimited Booths</p>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    Invite as many vendors as you want. Each gets their own booth, inventory, and checkout.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-warm-900 dark:text-gray-100 mb-1">Flexible Payouts</p>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    Choose your model: flat booth fee, revenue share, or a hybrid of both.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-warm-900 dark:text-gray-100 mb-1">QR Auto-Settlement</p>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    Shoppers scan, pay, and go. Vendor payouts are calculated and sent automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Your Events Section */}
            <div>
              <h2 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">
                Your Events
              </h2>

              {eventsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 h-20 animate-pulse" />
                  ))}
                </div>
              ) : eventsError ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-8 text-center">
                  <p className="text-warm-500 dark:text-gray-400 text-sm">{eventsError}</p>
                </div>
              ) : events.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-8 text-center">
                  <p className="text-2xl mb-3">🎪</p>
                  <p className="text-warm-900 dark:text-gray-100 font-medium mb-1">No events yet</p>
                  <p className="text-sm text-warm-500 dark:text-gray-400">
                    Create your first multi-vendor event to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4 flex items-center justify-between"
                    >
                      <div>
                        <h3 className="font-medium text-warm-900 dark:text-gray-100">{event.name}</h3>
                        <p className="text-sm text-warm-500 dark:text-gray-400">
                          {event.saleCount} {event.saleCount === 1 ? 'sale' : 'sales'}
                          {event.saleDate && <> · {new Date(event.saleDate).toLocaleDateString()}</>}
                        </p>
                      </div>
                      <Link
                        href={`/organizer/hubs/${event.id}/manage`}
                        className="text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
                      >
                        Manage →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </TierGate>
    </>
  );
}
