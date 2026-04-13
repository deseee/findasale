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

import { useState, useEffect, useCallback } from 'react';

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

const STORAGE_KEY = 'fas_shopper_cart';

export const useShopperCart = () => {
  const [cart, setCart] = useState<CartState>({ items: [], saleId: null });
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CartState;
        setCart(parsed);
      }
    } catch (err) {
      console.error('Failed to hydrate cart from localStorage:', err);
    }
    setIsHydrated(true);
  }, []);

  // Sync across same-tab instances (e.g. Layout + item page both mount useShopperCart)
  // The browser only fires 'storage' for other tabs — we dispatch manually from mutations
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSync = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setCart(JSON.parse(stored) as CartState);
      } catch {}
    };
    window.addEventListener('fas_cart_sync', handleSync);
    return () => window.removeEventListener('fas_cart_sync', handleSync);
  }, []);

  // Persist to localStorage whenever cart changes
  useEffect(() => {
    if (!isHydrated) return;
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (err) {
      console.error('Failed to persist cart to localStorage:', err);
    }
  }, [cart, isHydrated]);

  const notifySync = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('fas_cart_sync'));
    }
  }, []);

  const addItem = useCallback(
    (item: CartItem) => {
      setCart((prev) => {
        if (prev.saleId && prev.saleId !== item.saleId) return prev;
        if (prev.items.some((i) => i.id === item.id)) return prev;
        return { saleId: item.saleId, items: [...prev.items, item] };
      });
      // Notify other instances after state flush (next microtask)
      setTimeout(notifySync, 0);
    },
    [notifySync]
  );

  const removeItem = useCallback((itemId: string) => {
    setCart((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
    setTimeout(notifySync, 0);
  }, [notifySync]);

  const clearCart = useCallback(() => {
    setCart({ items: [], saleId: null });
    setTimeout(notifySync, 0);
  }, [notifySync]);

  const switchSale = useCallback((newSaleId: string) => {
    setCart({ items: [], saleId: newSaleId });
    setTimeout(notifySync, 0);
  }, [notifySync]);

  const getTotal = useCallback((): number => {
    return cart.items.reduce((sum, item) => sum + (item.price || 0), 0);
  }, [cart.items]);

  const getItems = useCallback((): CartItem[] => {
    return cart.items;
  }, [cart.items]);

  const canAddFromDifferentSale = useCallback((newSaleId: string): boolean => {
    // Returns true if cart is empty or saleId matches
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
