/**
 * Vendor Booth Payments — Organizer Multi-Booth Cart / Register (2026-07-07)
 * ADR-015/016/017. Roaming cart that can scan/select items from ANY booth in
 * this hub in one checkout. Functional over polished — correctness and full
 * state coverage prioritized over visual polish.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import TierGate from '../../../../components/TierGate';

interface CartTransaction {
  id: string;
  hubId: string;
  totalAmount: string | number;
  boothsRepresented: string[];
  status: string;
}

const BoothCartPage: React.FC = () => {
  const router = useRouter();
  const { hubId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [cart, setCart] = useState<CartTransaction | null>(null);
  const [itemIdInput, setItemIdInput] = useState('');
  const [addedItems, setAddedItems] = useState<Array<{ itemId: string; title: string; price: number }>>([]);
  const [rejectedItems, setRejectedItems] = useState<Array<{ itemId: string; reason: string }>>([]);
  const [starting, setStarting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [charging, setCharging] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const startCart = async () => {
    if (!hubId || typeof hubId !== 'string') return;
    setStarting(true);
    setStartError(null);
    try {
      const response = await api.post(`/organizer/hubs/${hubId}/cart/start`, { cashierType: 'TEAM_MEMBER' });
      setCart(response.data);
    } catch (error: any) {
      console.error('Error starting cart:', error);
      setStartError(error.response?.data?.error || 'Failed to start register session');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (user && hubId) startCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hubId]);

  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cart || !itemIdInput.trim()) return;
    setAdding(true);
    try {
      const response = await api.post(
        `/organizer/hubs/${hubId}/cart/${cart.id}/items`,
        { itemIds: [itemIdInput.trim()] }
      );
      setCart(response.data.cart);
      setAddedItems((prev) => [...prev, ...response.data.accepted]);
      if (response.data.rejected?.length > 0) {
        setRejectedItems((prev) => [...prev, ...response.data.rejected]);
        showToast(`Item could not be added: ${response.data.rejected[0].reason}`, 'error');
      } else {
        showToast('Item added to cart', 'success');
      }
      setItemIdInput('');
    } catch (error: any) {
      console.error('Error adding item:', error);
      showToast(error.response?.data?.error || 'Failed to add item', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleCharge = async () => {
    if (!cart) return;
    setCharging(true);
    try {
      const response = await api.post(`/organizer/hubs/${hubId}/cart/${cart.id}/charge`, {});
      setClientSecret(response.data.clientSecret);
      showToast('Payment intent created — collect card payment now', 'success');
    } catch (error: any) {
      console.error('Error charging cart:', error);
      showToast(error.response?.data?.error || 'Failed to charge cart', 'error');
    } finally {
      setCharging(false);
    }
  };

  if (authLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Vendor Booth Register"
      description="Ring up items from any booth in this hub in one checkout. Available on TEAMS and above."
    >
      <Head>
        <title>Register | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-white mb-2">Multi-Booth Register</h1>
          <p className="text-warm-600 dark:text-warm-400 mb-8">
            Scan or enter item IDs from any booth in this hub — one checkout, one receipt.
          </p>

          {starting ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
              <p className="text-warm-600 dark:text-warm-400">Opening register session...</p>
            </div>
          ) : startError ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-8 text-center">
              <p className="text-red-700 dark:text-red-400 mb-2">{startError}</p>
              <button onClick={startCart} className="text-sm underline text-red-700 dark:text-red-400">
                Try again
              </button>
            </div>
          ) : !cart ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
              <p className="text-warm-600 dark:text-warm-400">No active register session</p>
            </div>
          ) : (
            <>
              <form onSubmit={handleAddItem} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-2">
                  Item ID (scan or type)
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={itemIdInput}
                    onChange={(e) => setItemIdInput(e.target.value)}
                    className="flex-1 border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white"
                    placeholder="Enter item ID"
                    aria-label="Item ID"
                    disabled={adding || cart.status !== 'PENDING'}
                  />
                  <button
                    type="submit"
                    disabled={adding || !itemIdInput.trim() || cart.status !== 'PENDING'}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    {adding ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </form>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-6">
                <h2 className="text-lg font-bold text-warm-900 dark:text-white mb-4">Cart</h2>
                {addedItems.length === 0 ? (
                  <p className="text-warm-500 dark:text-warm-400 text-sm">No items added yet</p>
                ) : (
                  <ul className="divide-y divide-warm-200 dark:divide-gray-700">
                    {addedItems.map((item, idx) => (
                      <li key={`${item.itemId}-${idx}`} className="py-2 flex justify-between text-sm">
                        <span className="text-warm-900 dark:text-white">{item.title}</span>
                        <span className="text-warm-700 dark:text-warm-300 font-bold">${Number(item.price).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {rejectedItems.length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400">
                    {rejectedItems.length} item(s) could not be added (unavailable or booth not ready).
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700 flex justify-between items-center">
                  <span className="font-bold text-warm-900 dark:text-white">Total</span>
                  <span className="text-xl font-bold text-warm-900 dark:text-white">
                    ${Number(cart.totalAmount).toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 text-xs text-warm-500 dark:text-warm-400">
                  {cart.boothsRepresented.length} booth(s) represented in this cart
                </div>
              </div>

              {clientSecret ? (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 text-center">
                  <p className="text-green-700 dark:text-green-400 font-bold mb-2">Payment intent created</p>
                  <p className="text-sm text-warm-600 dark:text-warm-400">
                    Collect the card payment on the connected card reader or checkout form, then confirm to finalize the sale.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleCharge}
                  disabled={charging || addedItems.length === 0 || cart.status !== 'PENDING'}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  {charging ? 'Creating payment...' : `Charge $${Number(cart.totalAmount).toFixed(2)}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </TierGate>
  );
};

export default BoothCartPage;
