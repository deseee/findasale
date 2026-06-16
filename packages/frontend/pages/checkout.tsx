/**
 * /checkout — Facebook Commerce Manager cart injection
 *
 * Facebook hits this URL when a shopper clicks "Buy on Website" from a
 * Facebook/Instagram Shop. Query string format:
 *
 *   /checkout?products=ITEM_ID:QUANTITY,ITEM_ID2:QUANTITY2&coupon=PROMO_CODE
 *
 * Client-side flow:
 *   1. Parse the first ITEM_ID from the products param
 *   2. Fetch the item from the backend (/api/items/:id)
 *   3. Write it into localStorage cart (fas_shopper_cart)
 *      - Append if same saleId already in cart; replace if different saleId
 *   4. Redirect to /sales/:saleId where the cart drawer is accessible
 *
 * Fallback: redirect to / on any parse / fetch error.
 *
 * Must be client-side — localStorage is not available server-side.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

const CART_KEY = 'fas_shopper_cart';

interface CartItem {
  id: string;
  title: string;
  price: number | null;
  photoUrl?: string;
  saleId: string;
}

interface CartState {
  items: CartItem[];
  saleId: string | null;
}

export default function CheckoutPage() {
  const router = useRouter();

  useEffect(() => {
    // router.query is populated only after hydration
    if (!router.isReady) return;

    const run = async () => {
      const { products } = router.query;

      if (!products || typeof products !== 'string') {
        console.warn('[checkout] Missing or invalid products param — redirecting to /');
        router.replace('/');
        return;
      }

      // Parse "ID:QTY,ID2:QTY2" — take only the first item ID
      const firstEntry = products.split(',')[0] ?? '';
      const itemId = firstEntry.split(':')[0].trim();

      if (!itemId) {
        console.warn('[checkout] Could not parse itemId — redirecting to /');
        router.replace('/');
        return;
      }

      try {
        const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          console.warn(`[checkout] Backend returned ${res.status} for item ${itemId} — redirecting to /`);
          router.replace('/');
          return;
        }

        const item = await res.json();
        const saleId: string | null = item.saleId ?? item.sale?.id ?? null;

        if (!saleId) {
          console.warn('[checkout] Item has no saleId — redirecting to /');
          router.replace('/');
          return;
        }

        const cartItem: CartItem = {
          id: item.id,
          title: item.title,
          price: item.price ?? null,
          photoUrl: Array.isArray(item.photoUrls) && item.photoUrls.length > 0
            ? item.photoUrls[0]
            : undefined,
          saleId,
        };

        // Read existing cart, merge or replace
        let existing: CartState = { items: [], saleId: null };
        try {
          const stored = localStorage.getItem(CART_KEY);
          if (stored) {
            existing = JSON.parse(stored) as CartState;
          }
        } catch {
          // Corrupt cart — start fresh
        }

        let updatedCart: CartState;
        if (existing.saleId && existing.saleId !== saleId) {
          // Different sale — replace cart
          updatedCart = { items: [cartItem], saleId };
        } else {
          // Same sale (or empty cart) — append if not already present
          const alreadyInCart = existing.items.some((i) => i.id === cartItem.id);
          updatedCart = {
            saleId,
            items: alreadyInCart ? existing.items : [...existing.items, cartItem],
          };
        }

        localStorage.setItem(CART_KEY, JSON.stringify(updatedCart));

        router.replace(`/sales/${encodeURIComponent(saleId)}`);
      } catch (err) {
        console.warn('[checkout] Unexpected error — redirecting to /:', err);
        router.replace('/');
      }
    };

    run();
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

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
      Adding to cart…
    </div>
  );
}
