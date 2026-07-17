/**
 * Facebook Marketplace Autofill — Extension Install Page
 *
 * PRO/TEAMS-gated install page for the FindA.Sale browser extension that
 * autofills and publishes Facebook Marketplace listings from the organizer's
 * FindA.Sale inventory.
 *
 * Gate logic mirrors brand-kit.tsx: useAuth auth guard (redirect to /login) +
 * useOrganizerTier tier check (PRO or TEAMS eligible). SIMPLE/free organizers
 * see an upgrade upsell instead of the download.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';

const MarketplaceExtensionPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { tier, tierLoading } = useOrganizerTier();

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText('chrome://extensions');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch (err) {
      // Clipboard may be unavailable (permissions / insecure context) — fail silently
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Redirect if not authenticated or not an organizer
  if (!isLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Loading state while auth / tier resolve
  if (isLoading || tierLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-3xl mx-auto px-4">
          <div className="animate-pulse text-warm-500 dark:text-gray-400">Loading…</div>
        </div>
      </div>
    );
  }

  const isEligible = tier === 'PRO' || tier === 'TEAMS';

  // Not eligible (SIMPLE / free) — show upgrade upsell, no download
  if (!isEligible) {
    return (
      <>
        <Head>
          <title>Facebook Marketplace Autofill - FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
          <div className="max-w-3xl mx-auto px-4 py-8">
            <Link
              href="/organizer/dashboard"
              className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block"
            >
              Back to dashboard
            </Link>

            <div className="card p-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <span className="inline-block bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded mb-4">
                PRO
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-blue-900 dark:text-blue-100 mb-3">
                Facebook Marketplace Autofill is a PRO feature
              </h1>
              <p className="text-blue-800 dark:text-blue-200 mb-6 leading-relaxed">
                This browser extension fills and publishes your Facebook Marketplace listings straight
                from your FindA.Sale inventory — so you list once and post everywhere. Upgrade to PRO to
                unlock it.
              </p>
              <Link
                href="/organizer/subscription"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Upgrade to PRO
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Eligible (PRO / TEAMS) — full install page
  return (
    <>
      <Head>
        <title>Facebook Marketplace Autofill - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link
            href="/organizer/dashboard"
            className="text-amber-600 hover:underline text-sm font-medium mb-4 inline-block"
          >
            Back to dashboard
          </Link>

          <h1 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-2">
            Facebook Marketplace Autofill
          </h1>
          <p className="text-warm-600 dark:text-gray-400 mb-8 leading-relaxed">
            This browser extension fills your Facebook Marketplace listings — title, price, condition,
            description, and photos — straight from your FindA.Sale inventory, then walks through
            publishing. You review before anything goes live.
          </p>

          {/* Download CTA */}
          <div className="card p-8 mb-8">
            <a
              href="/downloads/findasale-marketplace-extension.zip"
              download
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors text-center"
            >
              Download the extension
            </a>
          </div>

          {/* Install steps */}
          <div className="card p-8 mb-8">
            <h2 className="text-xl font-semibold text-warm-900 dark:text-gray-100 mb-6">
              Install it (about 2 minutes)
            </h2>
            <ol className="space-y-6">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center">
                  1
                </span>
                <div className="text-warm-700 dark:text-gray-300 leading-relaxed">
                  <span className="font-semibold text-warm-900 dark:text-gray-100">
                    Download and unzip.
                  </span>{' '}
                  Click Download above, then unzip the file to a permanent folder on your computer
                  (e.g. Documents) — Chrome runs the extension from that folder, so don&apos;t delete
                  it afterward.
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center">
                  2
                </span>
                <div className="text-warm-700 dark:text-gray-300 leading-relaxed">
                  <span className="font-semibold text-warm-900 dark:text-gray-100">
                    Open your browser&apos;s extensions page.
                  </span>{' '}
                  In Chrome or Edge, go to the address below. (Browsers block opening{' '}
                  <code className="font-mono text-sm bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-gray-100 px-1.5 py-0.5 rounded">
                    chrome://
                  </code>{' '}
                  links from a page, so copy and paste it.)
                  <div className="flex items-center gap-2 mt-3">
                    <code className="font-mono text-sm bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-gray-100 px-3 py-1.5 rounded border border-warm-200 dark:border-gray-600">
                      chrome://extensions
                    </code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="text-xs font-medium bg-warm-200 dark:bg-gray-600 hover:bg-warm-300 dark:hover:bg-gray-500 text-warm-800 dark:text-gray-100 px-3 py-1.5 rounded transition-colors"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center">
                  3
                </span>
                <div className="text-warm-700 dark:text-gray-300 leading-relaxed">
                  <span className="font-semibold text-warm-900 dark:text-gray-100">
                    Turn on Developer mode
                  </span>{' '}
                  using the toggle in the top-right of that page.
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center">
                  4
                </span>
                <div className="text-warm-700 dark:text-gray-300 leading-relaxed">
                  <span className="font-semibold text-warm-900 dark:text-gray-100">
                    Click &quot;Load unpacked&quot;
                  </span>{' '}
                  and select the folder you unzipped in step 1.
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center">
                  5
                </span>
                <div className="text-warm-700 dark:text-gray-300 leading-relaxed">
                  <span className="font-semibold text-warm-900 dark:text-gray-100">
                    Sign in at finda.sale
                  </span>{' '}
                  in the same browser as your organizer account (the extension reads your finda.sale
                  login).
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center">
                  6
                </span>
                <div className="text-warm-700 dark:text-gray-300 leading-relaxed">
                  <span className="font-semibold text-warm-900 dark:text-gray-100">
                    Pin the FindA.Sale icon
                  </span>{' '}
                  (puzzle-piece menu → pin), then click it — your items load, grouped by sale.
                </div>
              </li>
            </ol>
          </div>

          {/* Good to know */}
          <div className="border-t border-warm-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-semibold text-warm-700 dark:text-gray-300 mb-3">
              Good to know
            </h3>
            <ul className="space-y-2 text-sm text-warm-500 dark:text-gray-400 list-disc pl-5">
              <li>
                While the extension is working, Chrome shows its own &quot;debugging this tab&quot;
                banner — that&apos;s normal and closes when the tab closes.
              </li>
              <li>
                One-click install through the Chrome Web Store is coming; for now this is the direct
                developer install.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default MarketplaceExtensionPage;
