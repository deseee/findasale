import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../../lib/api';
import { ETSY_CALLBACK_COPY } from '../../lib/etsyCopy';
import {
  ETSY_CALLBACK_PATH,
  buildEtsySettingsRedirect,
  claimEtsyCallbackOnce,
  outcomeFromCallbackError,
  parseEtsyCallbackQuery,
} from '../../lib/etsyCallback';

/**
 * pages/organizer/etsy-oauth-callback.tsx (ADR-135 D1.5, batch E-B5)
 *
 * Etsy sends the organizer back here after the consent screen (redirect URI
 * https://finda.sale/organizer/etsy-oauth-callback, registered once in the Etsy developer portal; the
 * path must not change). Etsy appends `code` + `state` (approved) or `error` (declined).
 *
 * This page does four things, in this order, and nothing else:
 *   1. read the query ONCE and scrub it from the address bar and history (the code is single use);
 *   2. post { code, state } to POST /api/etsy/callback EXACTLY once (a ref plus a per-state in-memory
 *      guard make a repeat effect run a no-op, including React strict mode in development);
 *   3. show progress while that call runs;
 *   4. send the organizer to Settings, Etsy tab, with a success or error banner.
 *
 * Rules: `code` and `state` stay in memory only (never storage, never a redirect target, never a
 * console message: this file has no console calls on purpose, because an axios error object can carry
 * the request body); the banner reason in the redirect is a key from a fixed whitelist.
 * Auth is the cookie session through the /api proxy (lib/api.ts); no manual header is needed.
 */

export default function EtsyOAuthCallbackPage() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!router.isReady || startedRef.current) return;
    startedRef.current = true;

    const parsed = parseEtsyCallbackQuery(router.query as Record<string, unknown>);

    const goToSettings = (target: string) => {
      setRedirecting(true);
      router.replace(target).catch(() => undefined);
    };

    if (parsed.kind === 'denied') {
      goToSettings(buildEtsySettingsRedirect({ ok: false, reason: 'denied' }));
      return;
    }
    if (parsed.kind === 'missing') {
      goToSettings(buildEtsySettingsRedirect({ ok: false, reason: 'missing' }));
      return;
    }
    if (!claimEtsyCallbackOnce(parsed.state)) return;

    // Scrub code and state from the address bar and history right away (the post below takes a moment,
    // so this shallow replace has finished long before the final redirect).
    router.replace(ETSY_CALLBACK_PATH, undefined, { shallow: true });

    api
      .post('/etsy/callback', { code: parsed.code, state: parsed.state })
      .then(
        () => goToSettings(buildEtsySettingsRedirect({ ok: true })),
        (err: unknown) => goToSettings(buildEtsySettingsRedirect(outcomeFromCallbackError(err)))
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  return (
    <>
      <Head>
        <title>{ETSY_CALLBACK_COPY.pageTitle}</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Head>

      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900 px-4 py-12">
        <div
          role="status"
          aria-live="polite"
          className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8 text-center"
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">{ETSY_CALLBACK_COPY.workingTitle}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {redirecting ? ETSY_CALLBACK_COPY.redirecting : ETSY_CALLBACK_COPY.workingBody}
          </p>
        </div>
      </div>
    </>
  );
}
