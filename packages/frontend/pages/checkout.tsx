/**
 * /checkout — Facebook Commerce Manager checkout URL endpoint
 *
 * Facebook hits this URL when a shopper clicks "Buy on Website" from a
 * Facebook/Instagram Shop, and Meta's Commerce Manager also hits it directly
 * (server-side, not necessarily executing client JS) when the seller runs the
 * "test your checkout URL" flow in Commerce Manager settings. Query format:
 *
 *   /checkout?products=ITEM_ID:QUANTITY,ITEM_ID2:QUANTITY2&coupon=PROMO_CODE
 *
 * FIX (2026-07-06): This used to be a purely client-side page — it rendered a
 * static "Adding to cart…" shell and only redirected after a useEffect ran in
 * the browser. Meta's checkout-URL validator flagged ArtifactMI's shop with
 * "issues with your checkout" — confirmed live that hitting the bare URL
 * produces no observable server-level redirect, just a static shell. Any
 * validator that doesn't execute client JS (or only inspects the HTTP
 * response chain) sees nothing resembling a working checkout endpoint.
 *
 * Fix: resolve and redirect server-side via getServerSideProps, so the
 * checkout URL always responds with a real HTTP redirect (307) to a
 * concrete destination — either the sale page (valid products) or the
 * homepage (invalid/missing products) — regardless of whether the caller
 * runs JavaScript. The actual cart-building (localStorage write, since that
 * API doesn't exist server-side) now happens on the destination sale page,
 * which reads the forwarded `fbCheckout`/`coupon` query params. See
 * pages/sales/[id].tsx for that half of the flow.
 */

import type { GetServerSideProps } from 'next';

// SSR only ever talks to the Railway API directly (server-to-server, no cookie
// concerns) — mirrors the same pattern documented in lib/api.ts.
const RAILWAY_API = (process.env.NEXT_PUBLIC_API_URL || 'https://api.finda.sale/api').replace(/\/$/, '');

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { products, coupon } = context.query;

  if (!products || typeof products !== 'string') {
    return { redirect: { destination: '/', permanent: false } };
  }

  // Parse "ID:QTY,ID2:QTY2" — we only need the first item id to resolve the sale.
  const firstEntry = products.split(',')[0];
  const firstItemId = firstEntry ? firstEntry.split(':')[0].trim() : '';

  if (!firstItemId) {
    return { redirect: { destination: '/', permanent: false } };
  }

  try {
    const res = await fetch(`${RAILWAY_API}/items/${encodeURIComponent(firstItemId)}`);
    if (!res.ok) {
      return { redirect: { destination: '/', permanent: false } };
    }
    const item = await res.json();
    const saleId: string | null = item?.saleId ?? item?.sale?.id ?? null;

    if (!saleId) {
      return { redirect: { destination: '/', permanent: false } };
    }

    const params = new URLSearchParams();
    params.set('fbCheckout', products);
    if (typeof coupon === 'string' && coupon.trim()) {
      params.set('coupon', coupon.trim());
    }
    params.set('cart', 'open');

    return {
      redirect: {
        destination: `/sales/${encodeURIComponent(saleId)}?${params.toString()}`,
        permanent: false,
      },
    };
  } catch (err) {
    console.warn('[checkout] SSR resolve failed — redirecting to /:', err);
    return { redirect: { destination: '/', permanent: false } };
  }
};

// Reached only if Next.js somehow renders the page without following the
// redirect above (shouldn't happen) — keep a minimal, honest fallback shell.
export default function CheckoutPage() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'sans-serif',
        fontSize: '1rem',
        color: '#666',
      }}
    >
      Redirecting to checkout…
    </div>
  );
}
