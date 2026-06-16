/**
 * /checkout — Facebook Commerce Manager checkout redirect
 *
 * Facebook hits this URL when a shopper clicks "Buy on Website" from a
 * Facebook/Instagram Shop. The query string format is:
 *
 *   /checkout?products=ITEM_ID:QUANTITY,ITEM_ID2:QUANTITY2&coupon=PROMO_CODE
 *
 * Because every FindA.Sale listing is a unique item (no traditional cart),
 * we redirect to the first item's detail page: /items/{itemId}
 *
 * Fallback: redirect to / (homepage) on any parse/fetch error or missing param.
 *
 * This page uses getServerSideProps so the redirect is server-side (no flash,
 * no client JS required, works for anonymous crawlers / Facebook's bot).
 */

import type { GetServerSideProps } from 'next';

// This component is never rendered — getServerSideProps always redirects.
export default function CheckoutRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { products } = context.query;

  // products param is required
  if (!products || typeof products !== 'string') {
    return {
      redirect: { destination: '/', permanent: false },
    };
  }

  // Parse "ID:QTY,ID2:QTY2" — take only the first item
  const firstEntry = products.split(',')[0];
  const itemId = firstEntry.split(':')[0].trim();

  if (!itemId) {
    return {
      redirect: { destination: '/', permanent: false },
    };
  }

  // Fetch item from backend to verify it exists (saleId available if needed later)
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  try {
    const res = await fetch(`${apiUrl}/items/${encodeURIComponent(itemId)}`, {
      headers: { Accept: 'application/json' },
      // 5-second timeout — Facebook's crawler must not hang
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Item not found or backend error — fall back to homepage
      console.warn(
        `[checkout] Backend returned ${res.status} for item ${itemId} — redirecting to /`,
      );
      return {
        redirect: { destination: '/', permanent: false },
      };
    }

    // Item exists — redirect to its detail page
    return {
      redirect: {
        destination: `/items/${encodeURIComponent(itemId)}`,
        permanent: false,
      },
    };
  } catch (err) {
    console.error('[checkout] Failed to fetch item:', err);
    return {
      redirect: { destination: '/', permanent: false },
    };
  }
};
