/**
 * Creator affiliate link landing page (/affiliate/:id).
 *
 * Calls GET /api/affiliate/click/:id, which counts the click (deduped per link, IP and day, bots and
 * self-clicks ignored) and says whether it is attributable. When it is, the affiliate link id is
 * saved for checkout (lib/affiliateAttribution.ts) and the visitor is sent to the sale page.
 * :id is either an AffiliateLink id or a creator code (CRT_XXXXXX, used with ?sale=<saleId>).
 *
 * The page is a redirect only, so it is noindex and never appears in the sitemap.
 */

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import { saveAffiliateAttribution } from '../../lib/affiliateAttribution';

const AffiliateRedirect = () => {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const id = typeof router.query.id === 'string' ? router.query.id : '';
    const saleHint = typeof router.query.sale === 'string' ? router.query.sale : undefined;
    if (!id) {
      router.replace('/');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/affiliate/click/${encodeURIComponent(id)}`, {
          params: saleHint ? { sale: saleHint } : undefined,
        });
        if (cancelled) return;
        const { saleId, affiliateLinkId } = res.data || {};
        if (affiliateLinkId) saveAffiliateAttribution(affiliateLinkId, saleId ?? null);
        router.replace(saleId ? `/sales/${saleId}` : '/');
      } catch {
        // Unknown or expired link: nothing to attribute. Do not strand the visitor.
        if (cancelled) return;
        setFailed(true);
        router.replace('/');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.id, router.query.sale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Head>
        <title>Taking you to the sale | FindA.Sale</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="min-h-screen flex flex-col items-center justify-center bg-warm-50 dark:bg-gray-900 px-4 text-center">
        <p className="text-warm-600 dark:text-warm-400" role="status">
          {failed ? 'That link is no longer active. Taking you to FindA.Sale...' : 'Taking you to the sale...'}
        </p>
        <Link href="/" className="mt-4 text-sm text-amber-700 dark:text-amber-400 underline">
          Continue to FindA.Sale
        </Link>
      </div>
    </>
  );
};

export default AffiliateRedirect;
