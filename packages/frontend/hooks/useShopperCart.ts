/**
 * useShopperCart — localStorage-based browsing cart hook (Phase 1 Smart Cart)
 * Separate from holds/reservations system. Cart is scoped to a single sale.
 *
 * Usage:
 *   const cart = useShopperCart();
 *   cart.addItem({ id: '...', title: '...', price: 100, saleId: 'sale1' });
 *   cart.removeItem('item-id');
 *   cart.getTotal(); // returns sum of prices
 *   cart.getItems(); // returns CartItem[]
 *   cart.clearCart();
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface CartItem {
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

const BASE_STORAGE_KEY = 'fas_shopper_cart';
const getStorageKey = (userId?: string) =>
  userId ? `${BASE_STORAGE_KEY}_${userId}` : BASE_STORAGE_KEY;

export const useShopperCart = (userId?: string) => {
  const STORAGE_KEY = getStorageKey(userId);
  const [cart, setCart] = useState<CartState>({ items: [], saleId: null });
  const [isHydrated, setIsHydrated] = useState(false);
  // Prevents the persistence effect → sync handler → setCart → persistence loop.
  // dispatchEvent is synchronous: set true before dispatch, false after.
  // The sync handler checks this and skips self-dispatched events.
  const isSelfSync = useRef(false);

  // Hydrate from localStorage on mount AND when userId/key changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setCart(JSON.parse(stored) as CartState);
      }
      // No else: if no stored data, keep existing state (avoids unnecessary re-render)
    } catch (err) {
      console.error('Failed to hydrate cart from localStorage:', err);
    }
    setIsHydrated(true);
  }, [STORAGE_KEY]);

  // Sync across same-tab instances (e.g. Layout + item page both mount useShopperCart).
  // Skips events this instance dispatched to prevent the persistence → sync → setCart loop.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSync = () => {
      if (isSelfSync.current) return; // Skip: we wrote this, React state already up to date
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setCart(JSON.parse(stored) as CartState);
      } catch {}
    };
    window.addEventListener('fas_cart_sync', handleSync);
    return () => window.removeEventListener('fas_cart_sync', handleSync);
  }, [STORAGE_KEY]);

  // Persist to localStorage after every cart change (post-hydration).
  // Guard isSelfSync around the dispatch so the sync handler ignores our own event.
  useEffect(() => {
    if (!isHydrated) return;
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
      isSelfSync.current = true;
      window.dispatchEvent(new Event('fas_cart_sync'));
      isSelfSync.current = false;
    } catch (err) {
      console.error('Failed to persist cart to localStorage:', err);
    }
  }, [cart, isHydrated]);

  const addItem = useCallback(
    (item: CartItem) => {
      setCart((prev) => {
        if (prev.saleId && prev.saleId !== item.saleId) return prev;
        if (prev.items.some((i) => i.id === item.id)) return prev;
        return { saleId: item.saleId, items: [...prev.items, item] };
      });
    },
    []
  );

  const removeItem = useCallback((itemId: string) => {
    setCart((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
  }, []);

  const clearCart = useCallback(() => {
    setCart({ items: [], saleId: null });
  }, []);

  const switchSale = useCallback((newSaleId: string) => {
    setCart({ items: [], saleId: newSaleId });
  }, []);

  const getTotal = useCallback((): number => {
    return cart.items.reduce((sum, item) => sum + (item.price || 0), 0);
  }, [cart.items]);

  const getItems = useCallback((): CartItem[] => {
    return cart.items;
  }, [cart.items]);

  const canAddFromDifferentSale = useCallback((newSaleId: string): boolean => {
    return !cart.saleId || cart.saleId === newSaleId;
  }, [cart.saleId]);

  const cartCount = cart.items.length;
  const saleId = cart.saleId;

  return {
    items: cart.items,
    addItem,
    removeItem,
    clearCart,
    getTotal,
    getItems,
    canAddFromDifferentSale,
    switchSale,
    cartCount,
    saleId,
    isHydrated,
  };
};
