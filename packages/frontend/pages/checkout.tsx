/**
 * /checkout — Facebook Commerce Manager cart injection
 *
 * Facebook hits this URL when a shopper clicks "Buy on Website" from a
 * Facebook/Instagram Shop. Query string format:
 *
 *   /checkout?products=ITEM_ID:QUANTITY,ITEM_ID2:QUANTITY2&coupon=PROMO_CODE
 *
 * Client-side flow:
 *   1. Parse ALL item IDs from the products param
 *   2. Fetch each item from the backend (/api/items/:id) in parallel
 *   3. Determine the primary saleId (first successfully-fetched item)
 *   4. Filter to items from that same sale (single-sale cart constraint)
 *   5. Write them into localStorage cart (fas_shopper_cart)
 *      - Append if same saleId already in cart; replace if different saleId
 *      - Price stored in CENTS (multiply API dollars × 100) so ShopperCartDrawer
 *        can display with its standard `(price / 100).toFixed(2)` logic
 *   6. Redirect to /sales/:saleId where the cart drawer is accessible
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

/** Convert a raw API item record to a CartItem with price in CENTS. */
function toCartItem(item: Record<string, unknown>, saleId: string): CartItem {
  return {
    id: item.id as string,
    title: item.title as string,
    // API returns price in dollars; ShopperCartDrawer displays (price / 100)
    price:
      item.price != null ? Math.round(Number(item.price) * 100) : null,
    photoUrl:
      Array.isArray(item.photoUrls) && (item.photoUrls as unknown[]).length > 0
        ? (item.photoUrls as string[])[0]
        : undefined,
    saleId,
  };
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

      // Parse "ID:QTY,ID2:QTY2" — extract all item IDs
      const entries = products.split(',');
      const itemIds: string[] = entries
        .map((e) => e.split(':')[0].trim())
        .filter(Boolean);

      if (itemIds.length === 0) {
        console.warn('[checkout] Could not parse any itemIds — redirecting to /');
        router.replace('/');
        return;
      }

      try {
        // Fetch all items in parallel
        const results = await Promise.all(
          itemIds.map((id) =>
            fetch(`/api/items/${encodeURIComponent(id)}`, {
              credentials: 'include',
            }).then((res) =>
              res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))
            )
          )
        );

        // Determine primary saleId from the first successfully-resolved item
        const primaryItem = results[0] as Record<string, unknown> | undefined;
        if (!primaryItem) {
          console.warn('[checkout] No items returned — redirecting to /');
          router.replace('/');
          return;
        }

        const saleId: string | null =
          (primaryItem.saleId as string | undefined) ??
          ((primaryItem.sale as Record<string, unknown> | undefined)?.id as string | undefined) ??
          null;

        if (!saleId) {
          console.warn('[checkout] Item has no saleId — redirecting to /');
          router.replace('/');
          return;
        }

        // Build cart items — only include items from the same sale
        const newCartItems: CartItem[] = (results as Record<string, unknown>[])
          .filter((item) => {
            const itemSaleId =
              (item.saleId as string | undefined) ??
              ((item.sale as Record<string, unknown> | undefined)?.id as string | undefined);
            return itemSaleId === saleId;
          })
          .map((item) => toCartItem(item, saleId));

        if (newCartItems.length === 0) {
          console.warn('[checkout] No valid cart items after sale filter — redirecting to /');
          router.replace('/');
          return;
        }

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
          // Different sale — replace entire cart with incoming items
          updatedCart = { items: newCartItems, saleId };
        } else {
          // Same sale (or empty cart) — append items not already present
          const existingIds = new Set(existing.items.map((i) => i.id));
          const toAdd = newCartItems.filter((i) => !existingIds.has(i.id));
          updatedCart = {
            saleId,
            items: [...existing.items, ...toAdd],
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
