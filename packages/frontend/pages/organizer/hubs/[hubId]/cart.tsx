/**
 * Vendor Booth Payments — Organizer Multi-Booth Cart / Register (2026-07-07,
 * ADR-015/016/017; sequential per-booth checkout added 2026-07-08, ADR-020).
 * Roaming cart that can scan/select items from ANY booth in this hub in one
 * checkout. Functional over polished — correctness and full state coverage
 * prioritized over visual polish.
 *
 * ADR-020: each vendor booth is now its own Stripe Standard account (Direct
 * charge, its own merchant of record) — so a cart spanning N booths requires N
 * separate PaymentIntents instead of one combined charge. The shopper still taps
 * their card once per booth (still genuinely card-present every time — no fee/
 * liability-shift penalty), and once every booth has authorized, ALL legs are
 * captured together in one step. If any leg can't be resolved, the WHOLE cart
 * cancels (free, nothing was captured yet) and the cashier restarts a new cart
 * without the problem vendor's items — v1 behavior Patrick signed off on, not
 * partial-capture/split-transaction.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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

interface BoothSummary {
  vendorBoothId: string;
  vendorName: string;
  boothNumber: string;
  subtotalCents: number;
  itemCount: number;
  readyForStandardCharge: boolean;
  leg: { legId: string; status: string; rail: string } | null;
}

type BoothLegOutcome = 'pending' | 'connecting' | 'ready' | 'tapping' | 'authorized' | 'failed';

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
  const [startError, setStartError] = useState<string | null>(null);

  // ─── Sequential per-booth checkout state (ADR-020) ─────────────────────────
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [booths, setBooths] = useState<BoothSummary[]>([]);
  const [boothOutcomes, setBoothOutcomes] = useState<Record<string, BoothLegOutcome>>({});
  const [activeBoothIndex, setActiveBoothIndex] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [completed, setCompleted] = useState<{ itemsSold: number } | null>(null);
  const terminalRef = useRef<any>(null);

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

  // ─── Sequential per-booth checkout (ADR-020) ────────────────────────────────

  /** Connects (or reconnects) the Terminal SDK reader scoped to ONE booth's own
   *  Standard account. Each booth leg needs its OWN connection token — switching
   *  which connected account a physical reader processes for requires a fresh
   *  token (per docs.stripe.com/terminal/features/connect, direct-charge model:
   *  "the client SDKs create the PaymentIntent on the same connected account the
   *  ConnectionToken belongs to"). */
  const connectReaderForBooth = useCallback(async (vendorBoothId: string) => {
    const { loadStripeTerminal } = await import('@stripe/terminal-js');
    const StripeTerminal = await loadStripeTerminal();

    // Disconnect any previous booth's reader connection before switching accounts.
    if (terminalRef.current) {
      try {
        await terminalRef.current.disconnectReader();
      } catch (err) {
        console.warn('[cart] Failed to disconnect previous reader (non-fatal):', err);
      }
      terminalRef.current = null;
    }

    const terminal = StripeTerminal!.create({
      onFetchConnectionToken: async () => {
        const res = await api.post<{ secret: string }>(
          `/organizer/hubs/${hubId}/cart/${cart!.id}/terminal/connection-token`,
          { vendorBoothId }
        );
        return res.data.secret;
      },
      onUnexpectedReaderDisconnect: () => {
        showToast('Card reader disconnected unexpectedly.', 'error');
      },
    });

    const discoverResult = await terminal.discoverReaders({
      simulated: process.env.NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATED === 'true',
    });
    if ('error' in discoverResult) throw new Error(discoverResult.error.message);
    if (!discoverResult.discoveredReaders.length) {
      throw new Error('No readers found. Ensure the card reader is powered on and on the same WiFi network.');
    }

    const connectResult = await terminal.connectReader(discoverResult.discoveredReaders[0]);
    if ('error' in connectResult) throw new Error(connectResult.error.message);

    terminalRef.current = terminal;
    return terminal;
  }, [hubId, cart, showToast]);

  /** Runs ONE booth's leg: connect reader for that booth -> authorize (server
   *  creates the card_present manual-capture PaymentIntent on that booth's own
   *  account) -> physical tap -> processPayment. Advances to the next booth on
   *  success; on failure, cancels the WHOLE cart (whole-cart-cancel-and-restart,
   *  per Patrick's v1 sign-off — no partial-capture). */
  const runBoothLeg = useCallback(async (booth: BoothSummary) => {
    setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'connecting' }));
    try {
      const terminal = await connectReaderForBooth(booth.vendorBoothId);

      const authRes = await api.post(
        `/organizer/hubs/${hubId}/cart/${cart!.id}/terminal/authorize`,
        { vendorBoothId: booth.vendorBoothId }
      );
      const { clientSecret } = authRes.data;

      setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'ready' }));
      showToast(`Tap card for ${booth.vendorName} — $${(booth.subtotalCents / 100).toFixed(2)}`, 'success');

      setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'tapping' }));
      const collectResult = await terminal.collectPaymentMethod(clientSecret);
      if ('error' in collectResult) throw new Error(collectResult.error.message);

      const processResult = await terminal.processPayment(collectResult.paymentIntent);
      if ('error' in processResult) throw new Error(processResult.error.message);

      setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'authorized' }));
      return true;
    } catch (error: any) {
      console.error(`[cart] Booth leg failed for ${booth.vendorBoothId}:`, error);
      setBoothOutcomes((prev) => ({ ...prev, [booth.vendorBoothId]: 'failed' }));
      setCheckoutError(`${booth.vendorName}: ${error?.response?.data?.error || error?.message || 'Payment failed'}`);
      return false;
    }
  }, [connectReaderForBooth, hubId, cart, showToast]);

  const startSequentialCheckout = async () => {
    if (!cart) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const summaryRes = await api.get(`/organizer/hubs/${hubId}/cart/${cart.id}/summary`);
      const boothList: BoothSummary[] = summaryRes.data.booths;
      if (boothList.length === 0) {
        showToast('Cart is empty', 'error');
        setCheckoutLoading(false);
        return;
      }
      const notReady = boothList.find((b) => !b.readyForStandardCharge);
      if (notReady) {
        setCheckoutError(`${notReady.vendorName} has not completed Stripe onboarding yet — cannot charge this cart.`);
        setCheckoutLoading(false);
        return;
      }
      setBooths(boothList);
      setBoothOutcomes(Object.fromEntries(boothList.map((b) => [b.vendorBoothId, 'pending' as BoothLegOutcome])));
      setActiveBoothIndex(0);
      setCheckoutOpen(true);
      setCheckoutLoading(false);

      // Walk the booths sequentially — tap, tap, tap, done.
      for (let i = 0; i < boothList.length; i++) {
        setActiveBoothIndex(i);
        const ok = await runBoothLeg(boothList[i]);
        if (!ok) {
          await cancelCart();
          return;
        }
      }

      // Every leg authorized — capture all together.
      await captureAll();
    } catch (error: any) {
      console.error('[cart] Failed to start checkout:', error);
      setCheckoutError(error.response?.data?.error || 'Failed to start checkout');
      setCheckoutLoading(false);
    }
  };

  const captureAll = async () => {
    if (!cart) return;
    setCapturing(true);
    try {
      const res = await api.post(`/organizer/hubs/${hubId}/cart/${cart.id}/capture`, {});
      setCompleted({ itemsSold: res.data.itemsSold ?? 0 });
      showToast('Sale complete!', 'success');
    } catch (error: any) {
      console.error('[cart] Capture failed:', error);
      setCheckoutError(error.response?.data?.error || 'Failed to complete the sale — booths may need manual reconciliation.');
    } finally {
      setCapturing(false);
    }
  };

  const cancelCart = async () => {
    if (!cart) return;
    try {
      await api.post(`/organizer/hubs/${hubId}/cart/${cart.id}/cancel`, {});
    } catch (error) {
      console.error('[cart] Failed to cancel cart:', error);
    }
    showToast('Checkout cancelled — start a new cart without the problem vendor’s items.', 'error');
  };

  const resetForNewCart = () => {
    setCart(null);
    setAddedItems([]);
    setRejectedItems([]);
    setCheckoutOpen(false);
    setCheckoutError(null);
    setBooths([]);
    setBoothOutcomes({});
    setCompleted(null);
    startCart();
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
            Scan or enter item IDs from any booth in this hub. Each booth is billed separately — the
            customer taps their card once per booth represented in the cart.
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
          ) : completed ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center">
              <p className="text-green-700 dark:text-green-400 font-bold text-xl mb-2">Sale complete</p>
              <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                {completed.itemsSold} item(s) sold across {booths.length} booth(s). Receipt sent if an email was on file.
              </p>
              <button
                onClick={resetForNewCart}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Start new cart
              </button>
            </div>
          ) : checkoutOpen ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-warm-200 dark:border-gray-700 p-6 mb-6">
              <h2 className="text-lg font-bold text-warm-900 dark:text-white mb-4">Checkout — tap once per booth</h2>
              <ul className="space-y-3 mb-4">
                {booths.map((booth, idx) => {
                  const outcome = boothOutcomes[booth.vendorBoothId] || 'pending';
                  const isActive = idx === activeBoothIndex && !completed;
                  return (
                    <li
                      key={booth.vendorBoothId}
                      className={`p-3 rounded-lg border ${isActive ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-warm-200 dark:border-gray-700'}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-warm-900 dark:text-white">
                          {booth.vendorName}{booth.boothNumber ? ` (Booth ${booth.boothNumber})` : ''}
                        </span>
                        <span className="font-bold text-warm-700 dark:text-warm-300">${(booth.subtotalCents / 100).toFixed(2)}</span>
                      </div>
                      <div className="text-xs mt-1">
                        {outcome === 'pending' && <span className="text-warm-500">Waiting...</span>}
                        {outcome === 'connecting' && <span className="text-blue-600">Connecting to reader...</span>}
                        {outcome === 'ready' && <span className="text-blue-600 font-bold">Tap card now</span>}
                        {outcome === 'tapping' && <span className="text-blue-600">Processing tap...</span>}
                        {outcome === 'authorized' && <span className="text-green-600">Authorized ✓</span>}
                        {outcome === 'failed' && <span className="text-red-600">Failed</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {capturing && (
                <p className="text-center text-blue-600 font-bold mb-4">Finalizing sale — capturing all booths...</p>
              )}
              {checkoutError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400 mb-4">
                  {checkoutError}
                </div>
              )}
              {checkoutError && (
                <button
                  onClick={resetForNewCart}
                  className="w-full bg-warm-600 hover:bg-warm-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Start new cart
                </button>
              )}
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
                  {cart.boothsRepresented.length} booth(s) represented in this cart — the customer will tap their
                  card once per booth during checkout.
                </div>
              </div>

              {checkoutError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400 mb-4">
                  {checkoutError}
                </div>
              )}

              <button
                onClick={startSequentialCheckout}
                disabled={checkoutLoading || addedItems.length === 0 || cart.status !== 'PENDING'}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                {checkoutLoading ? 'Starting checkout...' : `Checkout $${Number(cart.totalAmount).toFixed(2)} (${cart.boothsRepresented.length} booth tap${cart.boothsRepresented.length === 1 ? '' : 's'})`}
              </button>
            </>
          )}
        </div>
      </div>
    </TierGate>
  );
};

export default BoothCartPage;
