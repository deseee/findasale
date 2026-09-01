/**
 * Public Sale Hub landing page — Feature #40, ADR-014 (Amendment A, 2026-07-28).
 * Route: /hubs/:slug
 *
 * Built per ADR-014 Amendment A (claude_docs/architecture/ADR-014-hubs-flea-market-repurpose.md:44-77):
 * venue, event date, map, and booth count are shown. Amendment A also calls for a
 * CONFIRMED-vendor-names-only directory and a link to the hub's published FLEA_MARKET
 * Sale for inventory. NEITHER of those two is rendered here: GET /api/hubs/:slug
 * (packages/backend/src/controllers/hubController.ts getHub, ~line 127) does not
 * return a vendor list or a linked Sale today — only { id, name, slug, description,
 * lat, lng, boothCount, saleDate, eventName, organizerName, organizerPhoto }. Adding
 * those fields is backend + schema work outside this page's scope; see the session
 * report for the flagged gap. Do not add a vendor list here from client-side
 * guesswork — that would defeat the whole point of Amendment A's PII removal.
 *
 * Data comes from the existing, frozen `useHub(slug)` hook (hooks/useHubs.ts) — do not
 * change that hook's shape from this page.
 *
 * VALID-STATE-ONLY-EXPOSURE: already enforced server-side. getHub queries
 * `where: { slug, isActive: true }` via findFirst, so a closed/deactivated hub gets the
 * exact same 404 { message: 'Hub not found' } response as a slug that never existed —
 * this page cannot and does not distinguish the two, by design (see hubController.ts
 * comment at the same query). No public leak of a closed hub's data occurs here.
 *
 * Pattern mirrored from pages/sales/zip/[zip].tsx: plain client-side useQuery-style hook
 * + next/head meta tags + loading/error/empty states. The full pages/sales/[id].tsx
 * pattern (getStaticProps/ISR, OG image generation, JSON-LD) was NOT used — this hub
 * page has no comparable image/inventory data to justify that machinery yet.
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { format, parseISO } from 'date-fns';
import { useHub } from '../../hooks/useHubs';

// Same no-SSR dynamic import pattern used everywhere else SaleMap is rendered
// (components/SaleMap.tsx wraps SaleMapInner the same way) — Leaflet cannot run
// during server render.
const SaleMap = dynamic(() => import('../../components/SaleMap'), { ssr: false });

export default function HubLandingPage() {
  const router = useRouter();
  const { slug } = router.query;

  const { data, isLoading, isError, error } = useHub(slug as string, {
    enabled: !!slug,
  });

  // router.query.slug is undefined on the very first client render before Next
  // hydrates the route params — same guard the zip page uses for the same reason.
  if (!slug) return null;

  const hub = data?.hub;

  // hubController.getHub returns the identical { message: 'Hub not found' } body for
  // both a nonexistent slug and a closed (isActive: false) hub — deliberately, so a
  // closed hub is never distinguishable from one that never existed. Match on that
  // exact message to show "not found" copy; anything else (network failure, 5xx,
  // rate limit) gets a distinct "try again" message instead of implying the market
  // doesn't exist.
  const notFound = (error as Error | undefined)?.message === 'Hub not found';

  const pageTitle = hub ? `${hub.eventName || hub.name} - FindA.Sale` : 'Market Hub - FindA.Sale';
  const pageDescription = hub
    ? (hub.description && hub.description.trim()) ||
      `${hub.eventName || hub.name}${hub.organizerName ? ` hosted by ${hub.organizerName}` : ''} — a multi-vendor market on FindA.Sale.`
    : 'Multi-vendor market event on FindA.Sale.';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        {hub && <meta property="og:title" content={pageTitle} />}
        {hub && <meta property="og:description" content={pageDescription} />}
        {hub && <meta property="og:type" content="event" />}
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link
            href="/"
            className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium text-sm mb-6 inline-block"
          >
            ← Back to FindA.Sale
          </Link>

          {isLoading && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-8 animate-pulse space-y-4">
              <div className="h-8 bg-warm-200 dark:bg-gray-700 rounded w-2/3" />
              <div className="h-4 bg-warm-200 dark:bg-gray-700 rounded w-1/3" />
              <div className="h-48 bg-warm-200 dark:bg-gray-700 rounded" />
            </div>
          )}

          {!isLoading && isError && (
            <div className="text-center py-16">
              <h1 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-2">
                {notFound ? 'Market not found' : 'Something went wrong'}
              </h1>
              <p className="text-warm-600 dark:text-gray-400 mb-6">
                {notFound
                  ? "The market you're looking for doesn't exist, or is no longer open."
                  : "We couldn't load this market right now. Please try again in a moment."}
              </p>
              <Link href="/" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium">
                Browse sales on FindA.Sale
              </Link>
            </div>
          )}

          {!isLoading && !isError && hub && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden">
              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                    Multi-Vendor Market
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-warm-900 dark:text-gray-100 mb-1">
                  {hub.eventName || hub.name}
                </h1>

                {hub.organizerName && (
                  <p className="text-sm text-warm-600 dark:text-gray-400 mb-4">
                    Hosted by {hub.organizerName}
                  </p>
                )}

                {/* Event date */}
                {hub.saleDate && (
                  <div className="flex items-center gap-2 text-warm-800 dark:text-gray-200 mb-2">
                    <span aria-hidden="true">📅</span>
                    <span className="font-medium">
                      {format(parseISO(hub.saleDate), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                )}

                {/* Booth count */}
                <div className="flex items-center gap-2 text-warm-800 dark:text-gray-200 mb-6">
                  <span aria-hidden="true">🏪</span>
                  <span className="font-medium">
                    {hub.boothCount} vendor {hub.boothCount === 1 ? 'booth' : 'booths'}
                  </span>
                </div>

                {hub.description && (
                  <p className="text-warm-700 dark:text-gray-300 whitespace-pre-line mb-6">
                    {hub.description}
                  </p>
                )}
              </div>

              {/* Venue map */}
              {typeof hub.lat === 'number' && typeof hub.lng === 'number' && (
                <div className="border-t border-warm-200 dark:border-gray-700">
                  <SaleMap
                    singlePin={{ lat: hub.lat, lng: hub.lng, label: hub.eventName || hub.name }}
                    center={[hub.lat, hub.lng]}
                    zoom={14}
                    height="320px"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
