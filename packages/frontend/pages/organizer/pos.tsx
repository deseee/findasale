/**
 * /organizer/pos — Stripe Terminal POS
 *
 * In-person card payment screen for organizers.
 * Reader: BBPOS WisePOS E / S700 (WiFi, internet discovery mode)
 * SDK: @stripe/terminal-js (browser SDK, loaded dynamically to avoid SSR)
 *
 * Flow:
 *   1. Select active sale
 *   2. Search for item by title or SKU
 *   3. Optionally collect buyer email for receipt
 *   4. Tap "Charge" → SDK presents card to reader → backend captures
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

type ReaderStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
type PaymentStatus = 'idle' | 'creating' | 'waiting_for_card' | 'processing' | 'success' | 'error' | 'cancelled';

// ─── Component ──────────────────────────────────────────────────────────────

export default function POSPage() {
  const { user, isLoading: loading } = useAuth();
  const router = useRouter();

  // Sale + item state
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [buyerEmail, setBuyerEmail] = useState('');

  // Terminal state
  const [readerStatus, setReaderStatus] = useState<ReaderStatus>('idle');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [lastPurchaseId, setLastPurchaseId] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');

  // Stripe Terminal SDK ref (dynamic import)
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
    api.get<{ sales?: Sale[]; data?: Sale[] }>('/sales/mine')
      .then(res => {
        // Filter to active (PUBLISHED) sales only
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

      // Discover WisePOS E / S700 over WiFi (internet mode)
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

      // Connect to the first available reader
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

  // ─── Payment flow ─────────────────────────────────────────────────────────

  const handleCharge = async () => {
    if (!selectedItem || !terminalRef.current) return;
    setPaymentStatus('creating');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // 1. Create PaymentIntent on backend
      const piRes = await api.post<{
        paymentIntentId: string;
        clientSecret: string;
        purchaseId: string;
        amount: number;
        platformFee: number;
      }>('/stripe/terminal/payment-intent', {
        itemId: selectedItem.id,
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
      });

      const { paymentIntentId: piId, clientSecret, purchaseId } = piRes.data;
      setPaymentIntentId(piId);

      // 2. Present card to reader
      setPaymentStatus('waiting_for_card');
      const collectResult = await terminalRef.current.collectPaymentMethod(clientSecret);
      if ('error' in collectResult) {
        throw new Error(collectResult.error.message);
      }

      // 3. Process payment (sends to Stripe network)
      setPaymentStatus('processing');
      const processResult = await terminalRef.current.processPayment(collectResult.paymentIntent);
      if ('error' in processResult) {
        throw new Error(processResult.error.message);
      }

      // 4. Capture on backend
      await api.post('/stripe/terminal/capture', { paymentIntentId: piId });

      setLastPurchaseId(purchaseId);
      setPaymentStatus('success');
      setSuccessMessage(
        `✅ Payment of $${selectedItem.price?.toFixed(2)} accepted${buyerEmail.trim() ? ` — receipt sent to ${buyerEmail.trim()}` : ''}.`
      );

      // Reset for next transaction
      setSelectedItem(null);
      setItemSearch('');
      setSearchResults([]);
      setBuyerEmail('');
    } catch (err: any) {
      console.error('[pos] Payment error:', err);
      setPaymentStatus('error');
      setErrorMessage(err?.message ?? 'Payment failed. Please try again.');
    }
  };

  const handleCancel = async () => {
    if (!terminalRef.current || paymentStatus === 'idle') return;
    try {
      await terminalRef.current.cancelCollectPaymentMethod();
    } catch { /* reader may already be idle */ }
    setPaymentStatus('cancelled');
    setErrorMessage('Payment cancelled.');

    // Call backend cancel endpoint if paymentIntentId exists
    if (paymentIntentId) {
      try {
        await api.post('/stripe/terminal/cancel', { paymentIntentId });
      } catch (err) {
        console.error('[pos] Failed to cancel payment intent on backend:', err);
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
    <div className="min-h-screen bg-warm-50 p-4 md:p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 font-fraunces">POS</h1>
          <p className="text-sm text-warm-500">In-person card payments</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${readerBadge.color}`}>
          {readerBadge.label}
        </span>
      </div>

      {/* Connect reader button */}
      {readerStatus === 'idle' || readerStatus === 'error' || readerStatus === 'disconnected' ? (
        <button
          onClick={initTerminal}
          className="w-full mb-6 py-3 rounded-xl bg-sage-700 text-white font-semibold hover:bg-sage-800 transition"
        >
          Connect Reader
        </button>
      ) : readerStatus === 'connecting' ? (
        <div className="w-full mb-6 py-3 rounded-xl bg-warm-200 text-warm-600 text-center text-sm animate-pulse">
          Searching for reader…
        </div>
      ) : null}

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
              setSelectedItem(null);
              setItemSearch('');
              setSearchResults([]);
            }}
            className="w-full border border-warm-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sage-500"
          >
            <option value="">Select a sale…</option>
            {sales.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        )}
      </div>

      {/* Item search */}
      {selectedSaleId && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 mb-1">Item</label>
          {selectedItem ? (
            <div className="flex items-center gap-3 border border-sage-300 rounded-xl p-3 bg-sage-50">
              {selectedItem.photoUrls?.[0] && (
                <img
                  src={selectedItem.photoUrls[0]}
                  alt={selectedItem.title}
                  className="w-14 h-14 rounded-lg object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-warm-900 truncate">{selectedItem.title}</p>
                {selectedItem.sku && (
                  <p className="text-xs text-warm-500">SKU: {selectedItem.sku}</p>
                )}
                <p className="text-lg font-bold text-sage-700">
                  {selectedItem.price != null ? `$${selectedItem.price.toFixed(2)}` : 'No price set'}
                </p>
              </div>
              <button
                onClick={() => { setSelectedItem(null); setItemSearch(''); setSearchResults([]); }}
                className="text-warm-400 hover:text-warm-700 text-xl leading-none"
                aria-label="Remove item"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                placeholder="Search by title or SKU…"
                className="w-full border border-warm-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
              />
              {searchResults.length > 0 && (
                <ul className="mt-1 border border-warm-200 rounded-lg bg-white shadow-sm divide-y divide-warm-100 max-h-48 overflow-y-auto">
                  {searchResults.map(item => (
                    <li key={item.id}>
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          setItemSearch('');
                          setSearchResults([]);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-warm-50 flex items-center justify-between"
                      >
                        <span className="text-sm text-warm-900 truncate">{item.title}</span>
                        <span className="text-sm font-semibold text-sage-700 ml-2 shrink-0">
                          {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {itemSearch.trim().length > 1 && searchResults.length === 0 && (
                <p className="mt-1 text-xs text-warm-400 italic">No available items match that search.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Buyer email (optional) */}
      {selectedItem && (
        <div className="mb-6">
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

      {/* Charge button */}
      {paymentStatus !== 'success' && (
        <div className="space-y-3">
          <button
            onClick={handleCharge}
            disabled={
              !selectedItem ||
              selectedItem.price == null ||
              readerStatus !== 'connected' ||
              ['creating', 'waiting_for_card', 'processing'].includes(paymentStatus)
            }
            className="w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed bg-sage-700 text-white hover:bg-sage-800 active:scale-95"
          >
            {paymentStatus === 'creating' && 'Creating payment…'}
            {paymentStatus === 'waiting_for_card' && '📲 Present card to reader…'}
            {paymentStatus === 'processing' && 'Processing…'}
            {(paymentStatus === 'idle' || paymentStatus === 'error' || paymentStatus === 'cancelled') &&
              selectedItem?.price != null &&
              `Charge $${selectedItem.price.toFixed(2)}`}
            {(paymentStatus === 'idle' || paymentStatus === 'error' || paymentStatus === 'cancelled') &&
              !selectedItem &&
              'Select an item'}
          </button>

          {['waiting_for_card', 'creating'].includes(paymentStatus) && (
            <button
              onClick={handleCancel}
              className="w-full py-2 rounded-xl border border-warm-300 text-warm-600 text-sm hover:bg-warm-100 transition"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Platform fee note */}
      {selectedItem?.price != null && paymentStatus === 'idle' && (
        <p className="mt-4 text-xs text-warm-400 text-center">
          Platform fee (10%) applied. Net payout: ~${(selectedItem.price * 0.9 * 0.971).toFixed(2)} after Stripe fees.
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
