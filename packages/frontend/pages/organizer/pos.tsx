/**
 * /organizer/pos — Stripe Terminal POS v2
 *
 * In-person payment screen with multi-item cart, quick-add buttons, cash payments, and numpad.
 * Reader: BBPOS WisePOS E / S700 (WiFi, internet discovery mode)
 * SDK: @stripe/terminal-js (browser SDK, loaded dynamically to avoid SSR)
 *
 * Features:
 *   - Multi-item cart with add/remove
 *   - Quick-add misc item buttons (25¢, 50¢, $1, $2, $5, $10)
 *   - Custom amount input via numpad
 *   - Card or cash payment mode
 *   - Collapsible numpad for price/cash entry
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Sale {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
}

interface Item {
  id: string;
  title: string;
  price: number | null;
  status: string;
  photoUrls: string[];
  sku: string | null;
}

interface CartItem {
  id: string;
  itemId?: string;
  title: string;
  amount: number;
  photoUrl?: string;
}

type ReaderStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
type PaymentStatus = 'idle' | 'creating' | 'waiting_for_card' | 'processing' | 'success' | 'error' | 'cancelled';
type PaymentMode = 'card' | 'cash';
type NumpadMode = 'price' | 'cash';

// ─── Component ──────────────────────────────────────────────────────────────

export default function POSPage() {
  const { user, isLoading: loading } = useAuth();
  const router = useRouter();

  // Sale + item state
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [buyerEmail, setBuyerEmail] = useState('');

  // Numpad state
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadValue, setNumpadValue] = useState('');
  const [numpadMode, setNumpadMode] = useState<NumpadMode>('price');

  // Payment state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('card');
  const [cashReceived, setCashReceived] = useState(0);

  // Terminal state
  const [readerStatus, setReaderStatus] = useState<ReaderStatus>('idle');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');

  // Stripe Terminal SDK ref
  const terminalRef = useRef<any>(null);
  const sdkLoadedRef = useRef(false);

  // ─── Auth guard ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!loading && (!user || user.role !== 'ORGANIZER')) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  // ─── Load sales ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user || user.role !== 'ORGANIZER') return;
    api
      .get<{ sales?: Sale[]; data?: Sale[] }>('/sales/mine')
      .then(res => {
        const all: Sale[] = res.data.sales ?? res.data.data ?? [];
        const active = all.filter((s: Sale) => s.status === 'PUBLISHED');
        setSales(active);
        if (active.length === 1) setSelectedSaleId(active[0].id);
      })
      .catch(err => console.error('[pos] Failed to load sales:', err));
  }, [user]);

  // ─── Initialize Stripe Terminal SDK ─────────────────────────────────────

  const initTerminal = useCallback(async () => {
    if (sdkLoadedRef.current) return;
    setReaderStatus('connecting');
    try {
      const { loadStripeTerminal } = await import('@stripe/terminal-js');
      const StripeTerminal = await loadStripeTerminal();

      const terminal = StripeTerminal!.create({
        onFetchConnectionToken: async () => {
          const res = await api.post<{ secret: string }>('/stripe/terminal/connection-token', {});
          return res.data.secret;
        },
        onUnexpectedReaderDisconnect: () => {
          setReaderStatus('disconnected');
          setErrorMessage('Reader disconnected unexpectedly. Please reconnect.');
        },
      });

      const discoverResult = await terminal.discoverReaders({
        simulated: process.env.NEXT_PUBLIC_STRIPE_TERMINAL_SIMULATED === 'true',
      });

      if ('error' in discoverResult) {
        throw new Error(discoverResult.error.message);
      }

      if (!discoverResult.discoveredReaders.length) {
        setReaderStatus('error');
        setErrorMessage('No readers found. Ensure WisePOS E is powered on and on the same WiFi network.');
        return;
      }

      const connectResult = await terminal.connectReader(discoverResult.discoveredReaders[0]);
      if ('error' in connectResult) {
        throw new Error(connectResult.error.message);
      }

      terminalRef.current = terminal;
      sdkLoadedRef.current = true;
      setReaderStatus('connected');
      setErrorMessage('');
    } catch (err: any) {
      console.error('[pos] Terminal init error:', err);
      setReaderStatus('error');
      setErrorMessage(err?.message ?? 'Failed to connect to reader.');
    }
  }, []);

  // ─── Item search ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedSaleId || !itemSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await api.get<{ data: Item[] }>(
          `/items?saleId=${selectedSaleId}&q=${encodeURIComponent(itemSearch.trim())}&status=AVAILABLE&limit=10`
        );
        setSearchResults(res.data.data ?? res.data ?? []);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [itemSearch, selectedSaleId]);

  // ─── Cart operations ────────────────────────────────────────────────────

  const addToCart = (item: Item | { title: string; amount: number }) => {
    const cartId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    if ('price' in item) {
      // Database item
      setCart(prev => [
        ...prev,
        {
          id: cartId,
          itemId: item.id,
          title: item.title,
          amount: item.price ?? 0,
          photoUrl: item.photoUrls?.[0],
        },
      ]);
    } else {
      // Misc item
      setCart(prev => [
        ...prev,
        {
          id: cartId,
          title: item.title,
          amount: item.amount,
        },
      ]);
    }
    setItemSearch('');
    setSearchResults([]);
  };

  const quickAddMisc = (amount: number) => {
    const label = amount >= 1 ? `$${amount.toFixed(0)}` : amount === 0.25 ? '25¢' : '50¢';
    addToCart({ title: `Misc ${label}`, amount });
  };

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(c => c.id !== cartId));
  };

  const clearCart = () => {
    setCart([]);
    setNumpadValue('');
    setCashReceived(0);
    setBuyerEmail('');
    setItemSearch('');
    setSearchResults([]);
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.amount, 0);
  const cartChange = Math.max(0, cashReceived - cartTotal);

  // ─── Numpad operations ──────────────────────────────────────────────────

  const handleNumpadKey = (key: string) => {
    if (key === 'backspace') {
      setNumpadValue(prev => prev.slice(0, -1));
    } else if (key === 'clear') {
      setNumpadValue('');
    } else if (key === '00') {
      setNumpadValue(prev => prev + '00');
    } else if (/^\d$/.test(key)) {
      setNumpadValue(prev => prev + key);
    }
  };

  const handleNumpadConfirm = () => {
    if (!numpadValue) return;

    const cents = parseInt(numpadValue, 10);
    const dollars = cents / 100;

    if (numpadMode === 'price') {
      if (dollars > 0) {
        const label = dollars >= 1 ? `$${dollars.toFixed(2)}` : `${cents}¢`;
        addToCart({ title: `Custom ${label}`, amount: dollars });
        setNumpadValue('');
        setNumpadOpen(false);
      }
    } else if (numpadMode === 'cash') {
      setCashReceived(dollars);
      setNumpadValue('');
      setNumpadOpen(false);
    }
  };

  // ─── Payment flows ──────────────────────────────────────────────────────

  const handleCharge = async () => {
    if (!cart.length || !terminalRef.current) return;
    setPaymentStatus('creating');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const items = cart.map(c => ({
        ...(c.itemId ? { itemId: c.itemId } : {}),
        amount: c.amount,
        label: c.title,
      }));

      const piRes = await api.post<{
        paymentIntentId: string;
        clientSecret: string;
        purchaseIds: string[];
        totalAmount: number;
        platformFee: number;
      }>('/stripe/terminal/payment-intent', {
        items,
        saleId: selectedSaleId,  // fallback for misc-only carts (no itemId in cart)
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
      });

      const { paymentIntentId: piId, clientSecret } = piRes.data;
      setPaymentIntentId(piId);

      // Present card to reader
      setPaymentStatus('waiting_for_card');
      const collectResult = await terminalRef.current.collectPaymentMethod(clientSecret);
      if ('error' in collectResult) {
        throw new Error(collectResult.error.message);
      }

      // Process payment
      setPaymentStatus('processing');
      const processResult = await terminalRef.current.processPayment(collectResult.paymentIntent);
      if ('error' in processResult) {
        throw new Error(processResult.error.message);
      }

      // Capture on backend
      await api.post('/stripe/terminal/capture', { paymentIntentId: piId });

      setPaymentStatus('success');
      setSuccessMessage(
        `✅ Card payment of $${cartTotal.toFixed(2)} accepted${buyerEmail.trim() ? ` — receipt sent to ${buyerEmail.trim()}` : ''}.`
      );

      clearCart();
    } catch (err: any) {
      console.error('[pos] Payment error:', err);
      setPaymentStatus('error');
      setErrorMessage(err?.message ?? 'Payment failed. Please try again.');
    }
  };

  const handleCashPayment = async () => {
    if (!cart.length || !selectedSaleId) return;
    setPaymentStatus('creating');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const items = cart.map(c => ({
        ...(c.itemId ? { itemId: c.itemId } : {}),
        amount: c.amount,
        label: c.title,
      }));

      await api.post('/stripe/terminal/cash-payment', {
        items,
        cashReceived,
        saleId: selectedSaleId,
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
      });

      setPaymentStatus('success');
      const change = (cashReceived - cartTotal).toFixed(2);
      setSuccessMessage(
        `✅ Cash sale recorded for $${cartTotal.toFixed(2)}. Change: $${change}${buyerEmail.trim() ? ` — receipt sent to ${buyerEmail.trim()}` : ''}.`
      );

      clearCart();
    } catch (err: any) {
      console.error('[pos] Cash payment error:', err);
      setPaymentStatus('error');
      setErrorMessage(err?.message ?? 'Cash sale failed. Please try again.');
    }
  };

  const handleCancel = async () => {
    if (!terminalRef.current || paymentStatus === 'idle') return;
    try {
      await terminalRef.current.cancelCollectPaymentMethod();
    } catch {}
    setPaymentStatus('cancelled');
    setErrorMessage('Payment cancelled.');

    if (paymentIntentId) {
      try {
        await api.post('/stripe/terminal/cancel', { paymentIntentId });
      } catch (err) {
        console.error('[pos] Failed to cancel payment intent:', err);
      }
      setPaymentIntentId('');
    }

    setPaymentStatus('idle');
  };

  const handleNewTransaction = () => {
    setPaymentStatus('idle');
    setErrorMessage('');
    setSuccessMessage('');
  };

  // ─── Reader status badge ─────────────────────────────────────────────────

  const readerBadge = {
    idle: { label: 'Reader not connected', color: 'bg-warm-200 text-warm-700' },
    connecting: { label: 'Connecting…', color: 'bg-amber-100 text-amber-700' },
    connected: { label: '● Reader connected', color: 'bg-emerald-100 text-emerald-700' },
    disconnected: { label: 'Reader disconnected', color: 'bg-red-100 text-red-700' },
    error: { label: 'Reader error', color: 'bg-red-100 text-red-700' },
  }[readerStatus];

  if (loading || !user) return null;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-warm-50 p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 font-fraunces">POS</h1>
          <p className="text-sm text-warm-500">In-person payments</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${readerBadge.color}`}>
          {readerBadge.label}
        </span>
      </div>

      {/* Connect reader button */}
      {(readerStatus === 'idle' || readerStatus === 'error' || readerStatus === 'disconnected') && (
        <button
          onClick={initTerminal}
          className="w-full mb-6 py-3 rounded-xl bg-sage-700 text-white font-semibold hover:bg-sage-800 transition"
        >
          Connect Reader
        </button>
      )}

      {readerStatus === 'connecting' && (
        <div className="w-full mb-6 py-3 rounded-xl bg-warm-200 text-warm-600 text-center text-sm animate-pulse">
          Searching for reader…
        </div>
      )}

      {/* Sale selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-warm-700 mb-1">Sale</label>
        {sales.length === 0 ? (
          <p className="text-sm text-warm-500 italic">No active sales. Publish a sale first.</p>
        ) : (
          <select
            value={selectedSaleId}
            onChange={e => {
              setSelectedSaleId(e.target.value);
              setItemSearch('');
              setSearchResults([]);
            }}
            className="w-full border border-warm-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sage-500"
          >
            <option value="">Select a sale…</option>
            {sales.map(s => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Item search + results */}
      {selectedSaleId && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 mb-1">Add items</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder="Search by title or SKU…"
              className="flex-1 border border-warm-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
            />
          </div>

          {searchResults.length > 0 && (
            <ul className="mt-1 border border-warm-200 rounded-lg bg-white shadow-sm divide-y divide-warm-100 max-h-40 overflow-y-auto">
              {searchResults.map(item => (
                <li key={item.id}>
                  <button
                    onClick={() => addToCart(item)}
                    className="w-full text-left px-3 py-2 hover:bg-warm-50 flex items-center justify-between"
                  >
                    <span className="text-sm text-warm-900 truncate">{item.title}</span>
                    <span className="text-sm font-semibold text-sage-700 ml-2 shrink-0">
                      +${item.price?.toFixed(2) ?? '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {itemSearch.trim().length > 1 && searchResults.length === 0 && (
            <p className="mt-1 text-xs text-warm-400 italic">No available items match that search.</p>
          )}
        </div>
      )}

      {/* Quick-add misc buttons */}
      {selectedSaleId && (
        <div className="mb-4">
          <p className="text-xs font-medium text-warm-600 mb-2">Quick add misc items:</p>
          <div className="grid grid-cols-3 gap-2">
            {[0.25, 0.5, 1.0, 2.0, 5.0, 10.0].map(amount => (
              <button
                key={amount}
                onClick={() => quickAddMisc(amount)}
                className="py-2 rounded-lg bg-warm-200 hover:bg-warm-300 text-warm-800 text-sm font-semibold transition"
              >
                {amount >= 1 ? `$${amount.toFixed(0)}` : amount === 0.25 ? '25¢' : '50¢'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom amount button */}
      {selectedSaleId && (
        <button
          onClick={() => {
            setNumpadMode('price');
            setNumpadOpen(prev => !prev);
            setNumpadValue('');
          }}
          className="w-full mb-4 py-2 rounded-lg bg-warm-100 border border-warm-300 text-warm-700 text-sm font-medium hover:bg-warm-200 transition"
        >
          Custom amount
        </button>
      )}

      {/* Numpad */}
      {numpadOpen && (
        <div className="mb-4 p-4 rounded-xl bg-white border border-warm-200 shadow-md">
          <div className="mb-3 p-2 rounded-lg bg-warm-50 border border-warm-200 text-center">
            <p className="text-xs text-warm-600">
              {numpadMode === 'price' ? 'Custom Amount' : 'Cash Received'}
            </p>
            <p className="text-2xl font-bold text-warm-900">
              ${(parseInt(numpadValue || '0', 10) / 100).toFixed(2)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1 mb-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'backspace'].map(key => (
              <button
                key={key}
                onClick={() => handleNumpadKey(key)}
                className="py-2 rounded-lg bg-warm-100 hover:bg-warm-200 text-warm-900 text-sm font-semibold transition active:bg-warm-300"
              >
                {key === 'backspace' ? '⌫' : key}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setNumpadValue('');
                setNumpadOpen(false);
              }}
              className="flex-1 py-2 rounded-lg bg-warm-200 text-warm-700 text-sm font-medium hover:bg-warm-300 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleNumpadConfirm}
              disabled={!numpadValue}
              className="flex-1 py-2 rounded-lg bg-sage-700 text-white text-sm font-medium hover:bg-sage-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ✓ Confirm
            </button>
          </div>
        </div>
      )}

      {/* Cart display */}
      {cart.length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-white border border-sage-200">
          <h3 className="text-sm font-semibold text-warm-900 mb-3">Cart ({cart.length})</h3>
          <ul className="space-y-2 mb-3 max-h-48 overflow-y-auto">
            {cart.map(item => (
              <li
                key={item.id}
                className="flex items-center justify-between p-2 rounded-lg bg-warm-50 border border-warm-100"
              >
                <div className="min-w-0 flex-1">
                  {item.photoUrl && (
                    <img
                      src={item.photoUrl}
                      alt={item.title}
                      className="w-8 h-8 rounded mb-1 object-cover"
                    />
                  )}
                  <p className="text-sm text-warm-900 truncate">{item.title}</p>
                </div>
                <div className="flex items-center gap-3 ml-2">
                  <span className="text-sm font-semibold text-sage-700">
                    ${item.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-warm-400 hover:text-red-600 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-warm-200 pt-3 text-sm">
            <div className="flex justify-between font-semibold text-warm-900 mb-1">
              <span>Total:</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Buyer email */}
      {cart.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 mb-1">
            Buyer email <span className="text-warm-400 font-normal">(optional — for receipt)</span>
          </label>
          <input
            type="email"
            value={buyerEmail}
            onChange={e => setBuyerEmail(e.target.value)}
            placeholder="buyer@email.com"
            className="w-full border border-warm-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
          />
        </div>
      )}

      {/* Payment mode selector */}
      {cart.length > 0 && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => {
              setPaymentMode('card');
              setNumpadOpen(false);
            }}
            className={`flex-1 py-3 rounded-xl font-semibold transition ${
              paymentMode === 'card'
                ? 'bg-sage-700 text-white'
                : 'bg-warm-200 text-warm-700 hover:bg-warm-300'
            }`}
          >
            💳 Card
          </button>
          <button
            onClick={() => {
              setPaymentMode('cash');
              setCashReceived(0);
            }}
            className={`flex-1 py-3 rounded-xl font-semibold transition ${
              paymentMode === 'cash'
                ? 'bg-sage-700 text-white'
                : 'bg-warm-200 text-warm-700 hover:bg-warm-300'
            }`}
          >
            💵 Cash
          </button>
        </div>
      )}

      {/* Error / success messages */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMessage}
        </div>
      )}

      {successMessage && paymentStatus === 'success' && (
        <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
          {successMessage}
          <button
            onClick={handleNewTransaction}
            className="block mt-3 w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition"
          >
            New Transaction
          </button>
        </div>
      )}

      {/* Charge buttons */}
      {paymentStatus !== 'success' && cart.length > 0 && (
        <div className="space-y-3">
          {paymentMode === 'card' ? (
            <>
              <button
                onClick={handleCharge}
                disabled={
                  readerStatus !== 'connected' ||
                  ['creating', 'waiting_for_card', 'processing'].includes(paymentStatus)
                }
                className="w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed bg-sage-700 text-white hover:bg-sage-800 active:scale-95"
              >
                {paymentStatus === 'creating' && 'Creating payment…'}
                {paymentStatus === 'waiting_for_card' && '📲 Present card to reader…'}
                {paymentStatus === 'processing' && 'Processing…'}
                {(paymentStatus === 'idle' || paymentStatus === 'error' || paymentStatus === 'cancelled') &&
                  `Charge $${cartTotal.toFixed(2)}`}
              </button>

              {['waiting_for_card', 'creating'].includes(paymentStatus) && (
                <button
                  onClick={handleCancel}
                  className="w-full py-2 rounded-xl border border-warm-300 text-warm-600 text-sm hover:bg-warm-100 transition"
                >
                  Cancel
                </button>
              )}
            </>
          ) : (
            <>
              <div className="p-3 rounded-lg bg-warm-50 border border-warm-200">
                <p className="text-xs text-warm-600 mb-1">Cash Received</p>
                <button
                  onClick={() => {
                    setNumpadMode('cash');
                    setNumpadOpen(true);
                    setNumpadValue(Math.round(cashReceived * 100).toString());
                  }}
                  className="w-full py-2 rounded-lg bg-white border border-warm-300 text-warm-900 font-semibold hover:bg-warm-50 transition"
                >
                  ${cashReceived.toFixed(2)}
                </button>
              </div>

              {cashReceived >= cartTotal && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="text-sm font-semibold text-emerald-700">
                    Change: ${cartChange.toFixed(2)}
                  </p>
                </div>
              )}

              <button
                onClick={handleCashPayment}
                disabled={cashReceived < cartTotal || ['creating'].includes(paymentStatus)}
                className="w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed bg-sage-700 text-white hover:bg-sage-800 active:scale-95"
              >
                {paymentStatus === 'creating' && 'Recording…'}
                {(paymentStatus === 'idle' || paymentStatus === 'error' || paymentStatus === 'cancelled') &&
                  `Record Cash Sale $${cartTotal.toFixed(2)}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Platform fee note */}
      {cart.length > 0 && paymentMode === 'card' && paymentStatus === 'idle' && (
        <p className="mt-4 text-xs text-warm-400 text-center">
          Platform fee (10%) applied. Net payout: ~${(cartTotal * 0.9 * 0.971).toFixed(2)} after Stripe fees.
        </p>
      )}

      {/* Back link */}
      <div className="mt-8 text-center">
        <a href="/organizer/dashboard" className="text-sm text-warm-400 hover:text-warm-600">
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
