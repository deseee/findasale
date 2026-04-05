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
 *   - Collapsible numpad for price entry; inline numpad for cash received
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useQuery } from '@tanstack/react-query';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import jsQR from 'jsqr';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import api from '../../lib/api';
import PosTierGates from '../../components/PosTierGates';
import PosInvoiceModal from '../../components/PosInvoiceModal';
import PosOpenCarts from '../../components/PosOpenCarts';
import PosPaymentQr from '../../components/PosPaymentQr';
import PosManualCard from '../../components/PosManualCard';
import { PosTierStatus } from '../../lib/types/posTiers';

// ─── Types ────────────────────────────────────────────────────────────────────────────

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
type PaymentMode = 'card' | 'manual_card' | 'cash' | 'qr' | 'invoice';
type NumpadMode = 'price';

interface CashPaymentResponse {
  platformFee: number;
  cashFeeBalance: number;
}

interface HoldItem {
  reservationId: string;
  itemId: string;
  itemTitle: string;
  itemPrice: number;
  shopperId: string;
  shopperName: string;
  shopperEmail: string;
  expiresAt: string;
}

interface LinkedCart {
  id: string;
  shopperName: string;
  cartItems: Array<{ id: string; title: string; price: number; photoUrl?: string; saleId: string }>;
  cartTotal: number;
  createdAt: string;
}

// ─── Stripe Helper ────────────────────────────────────────────────────────────────

// Lazy-initialize Stripe on client-side only to avoid SSR errors
let stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

// ─── Component ─────────────────────────────────────────────────────────────────────

export default function POSPage() {
  const { user, isLoading: loading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  // Sale + item state
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [buyerEmail, setBuyerEmail] = useState('');

  // Numpad state (price / custom amount only)
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadValue, setNumpadValue] = useState('');
  const [numpadMode] = useState<NumpadMode>('price');

  // Payment state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('card');
  const [cashReceived, setCashReceived] = useState(0);
  const [cashNumpadValue, setCashNumpadValue] = useState('');

  // Terminal state
  const [readerStatus, setReaderStatus] = useState<ReaderStatus>('idle');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');

  // Cash fee state
  const [lastCashFee, setLastCashFee] = useState<CashPaymentResponse | null>(null);

  // QR Scan camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [qrScanStatus, setQrScanStatus] = useState<'idle' | 'scanning' | 'found' | 'error'>('idle');
  const [qrScanMessage, setQrScanMessage] = useState('');

  // Payment QR state (for sending payment link to shopper)
  const [paymentLinkId, setPaymentLinkId] = useState('');
  const [paymentLinkQr, setPaymentLinkQr] = useState(''); // base64 data URL
  const [paymentLinkStatus, setPaymentLinkStatus] = useState<'idle' | 'generating' | 'waiting' | 'paid'>('idle');
  const [paymentLinkPollInterval, setPaymentLinkPollInterval] = useState<NodeJS.Timeout | null>(null);

  // Invoice/Holds state
  const [holds, setHolds] = useState<HoldItem[]>([]);
  const [holdsLoading, setHoldsLoading] = useState(false);
  const [invoiceModalHold, setInvoiceModalHold] = useState<HoldItem | null>(null);

  // Open Carts state
  const [linkedCarts, setLinkedCarts] = useState<LinkedCart[]>([]);
  const [linkedCartsPollInterval, setLinkedCartsPollInterval] = useState<NodeJS.Timeout | null>(null);

  // Stripe Terminal SDK ref
  const terminalRef = useRef<any>(null);
  const sdkLoadedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // POS Tiers data
  const { data: posTierStatus, isLoading: posTierLoading } = useQuery<PosTierStatus>({
    queryKey: ['organizer-pos-tiers'],
    queryFn: async () => {
      const res = await api.get<PosTierStatus>('/organizer/pos-tiers');
      return res.data;
    },
    enabled: !!user && user.roles?.includes('ORGANIZER'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // ─── Auth guard ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!loading && (!user || !user.roles?.includes('ORGANIZER'))) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  // ─── Load sales ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user || !user.roles?.includes('ORGANIZER')) return;
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

  // ─── Pre-select sale from query param ────────────────────────────────────────────

  useEffect(() => {
    if (router.isReady && router.query.saleId) {
      setSelectedSaleId(router.query.saleId as string);
    }
  }, [router.isReady, router.query.saleId]);

  // ─── Handle price sheet QR code auto-add-misc action ───────────────────────────────

  useEffect(() => {
    if (!router.isReady) return;

    const action = router.query.action;
    const priceStr = router.query.price;

    if (action === 'add-misc' && priceStr) {
      const price = parseFloat(priceStr as string);
      if (!isNaN(price) && price > 0) {
        // Add the misc item with the decoded price
        const label = price >= 1 ? `$${price.toFixed(0)}` : price === 0.25 ? '25¢' : '50¢';
        setCart(prev => [...prev, { id: `misc-${Date.now()}`, title: `Misc ${label}`, amount: price }]);

        // Clear the query params to prevent re-adding on page refresh
        router.replace({
          pathname: router.pathname,
          query: router.query.saleId ? { saleId: router.query.saleId } : {},
        }, undefined, { shallow: true });
      }
    }
  }, [router.isReady, router.query.action, router.query.price, router.pathname, router.query.saleId]);

  // ─── Initialize Stripe Terminal SDK ───────────────────────────────────────────────────────

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

  // ─── Item search ────────────────────────────────────────────────────────────────────

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

  // ─── Sync inline cash numpad → cashReceived ────────────────────────────────────────────

  useEffect(() => {
    const cents = parseInt(cashNumpadValue || '0', 10);
    setCashReceived(cents / 100);
  }, [cashNumpadValue]);

  // ─── Load holds when sale changes ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedSaleId) {
      setHolds([]);
      return;
    }
    setHoldsLoading(true);
    api
      .get<{ holds: HoldItem[] }>(`/pos/holds?saleId=${selectedSaleId}`)
      .then(res => setHolds(res.data.holds || []))
      .catch(err => console.error('[pos] Failed to load holds:', err))
      .finally(() => setHoldsLoading(false));
  }, [selectedSaleId]);

  // ─── Payment link polling ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (paymentLinkStatus !== 'waiting' || !paymentLinkId) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get<{ status: string }>(`/pos/payment-links/${paymentLinkId}`);
        if (res.data.status === 'COMPLETED') {
          setPaymentLinkStatus('paid');
          clearInterval(interval);
          setPaymentLinkPollInterval(null);
        }
      } catch (err) {
        console.error('[pos] Poll error:', err);
      }
    }, 3000);

    setPaymentLinkPollInterval(interval);
    return () => clearInterval(interval);
  }, [paymentLinkStatus, paymentLinkId]);

  const handleResetPaymentQr = () => {
    if (paymentLinkPollInterval) {
      clearInterval(paymentLinkPollInterval);
      setPaymentLinkPollInterval(null);
    }
    setPaymentLinkId('');
    setPaymentLinkQr('');
    setPaymentLinkStatus('idle');
  };

  // ─── Linked carts polling ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedSaleId) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get<{ sessions: LinkedCart[] }>(`/pos/sessions?saleId=${selectedSaleId}`);
        setLinkedCarts(res.data.sessions || []);
      } catch (err) {
        console.error('[pos] Linked carts poll error:', err);
      }
    }, 10000);

    setLinkedCartsPollInterval(interval);
    return () => clearInterval(interval);
  }, [selectedSaleId]);

  // ─── Cart operations ────────────────────────────────────────────────────────────────────

  const addToCart = (item: Item | { title: string; amount: number }) => {
    if ('price' in item) {
      // Block adding the same inventory item twice
      if (cart.some(c => c.itemId === item.id)) {
        setErrorMessage(`"${item.title}" is already in the cart.`);
        setItemSearch('');
        setSearchResults([]);
        return;
      }
    }

    const cartId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    if ('price' in item) {
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
      setCart(prev => [
        ...prev,
        {
          id: cartId,
          title: item.title,
          amount: item.amount,
        },
      ]);
    }
    setErrorMessage('');
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
    setCashNumpadValue('');
    setBuyerEmail('');
    setItemSearch('');
    setSearchResults([]);
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.amount, 0);
  const cartChange = Math.max(0, cashReceived - cartTotal);

  // ─── Numpad operations (price entry only) ───────────────────────────────────────────

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

    if (dollars > 0) {
      const label = dollars >= 1 ? `$${dollars.toFixed(2)}` : `${cents}¢`;
      addToCart({ title: `Custom ${label}`, amount: dollars });
      setNumpadValue('');
      setNumpadOpen(false);
    }
  };

  // ─── Payment flows ───────────────────────────────────────────────────────────────────

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
        saleId: selectedSaleId,
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
      });

      const { paymentIntentId: piId, clientSecret } = piRes.data;
      setPaymentIntentId(piId);

      setPaymentStatus('waiting_for_card');
      const collectResult = await terminalRef.current.collectPaymentMethod(clientSecret);
      if ('error' in collectResult) {
        throw new Error(collectResult.error.message);
      }

      setPaymentStatus('processing');
      const processResult = await terminalRef.current.processPayment(collectResult.paymentIntent);
      if ('error' in processResult) {
        throw new Error(processResult.error.message);
      }

      await api.post('/stripe/terminal/capture', { paymentIntentId: piId });

      setPaymentStatus('success');
      setSuccessMessage(
        `✅ Card payment of $${cartTotal.toFixed(2)} accepted${buyerEmail.trim() ? ` — receipt sent to ${buyerEmail.trim()}` : ''}.`
      );

      clearCart();
    } catch (err: any) {
      console.error('[pos] Payment error:', err);
      setPaymentStatus('error');
      // Surface the specific backend message (e.g. "Item X is not available") when present
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Payment failed. Please try again.';
      setErrorMessage(message);
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

      const response = await api.post<CashPaymentResponse>('/stripe/terminal/cash-payment', {
        items,
        cashReceived,
        saleId: selectedSaleId,
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
      });

      setLastCashFee(response.data);
      setPaymentStatus('success');
      const change = (cashReceived - cartTotal).toFixed(2);
      setSuccessMessage(
        `✅ Cash sale recorded for $${cartTotal.toFixed(2)}. Change: $${change}${buyerEmail.trim() ? ` — receipt sent to ${buyerEmail.trim()}` : ''}.`
      );

      clearCart();
    } catch (err: any) {
      console.error('[pos] Cash payment error:', err);
      setPaymentStatus('error');
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Cash sale failed. Please try again.';
      setErrorMessage(message);
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
    setLastCashFee(null);
  };

  // ─── QR Code Scanning ─────────────────────────────────────────────────────────────────────

  const startQRScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      videoRef.current.srcObject = stream;
      const video = videoRef.current;

      const scanLoop = () => {
        if (!video || !canvasRef.current || !video.videoWidth) {
          animationFrameRef.current = requestAnimationFrame(scanLoop);
          return;
        }

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        // @ts-ignore - jsqr types may not be perfect
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code) {
          const qrText = code.data;
          // Extract itemId from URL like https://finda.sale/qr/items/[itemId]
          const match = qrText.match(/items\/([a-z0-9]+)$/i);
          if (match) {
            const itemId = match[1];
            setQrScanStatus('found');
            setQrScanMessage('Item found! Adding to cart…');

            // Fetch item and add to cart
            api
              .get<Item>(`/items/${itemId}`)
              .then(res => {
                addToCart(res.data);
                showToast('✓ Item added to cart', 'success');
                setQrScanStatus('scanning');
                setQrScanMessage('');
                // Keep scanning open for next item
                animationFrameRef.current = requestAnimationFrame(scanLoop);
              })
              .catch(err => {
                setQrScanStatus('error');
                setQrScanMessage('Item not found or already in cart');
                console.error('[pos] QR item fetch error:', err);
                setTimeout(() => {
                  setQrScanStatus('scanning');
                  setQrScanMessage('');
                  animationFrameRef.current = requestAnimationFrame(scanLoop);
                }, 2000);
              });
          } else {
            setQrScanStatus('error');
            setQrScanMessage('Invalid QR code format');
            setTimeout(() => {
              setQrScanStatus('scanning');
              setQrScanMessage('');
              animationFrameRef.current = requestAnimationFrame(scanLoop);
            }, 2000);
          }
        } else {
          animationFrameRef.current = requestAnimationFrame(scanLoop);
        }
      };

      setQrScanStatus('scanning');
      animationFrameRef.current = requestAnimationFrame(scanLoop);
    } catch (err: any) {
      setQrScanStatus('error');
      if (err.name === 'NotAllowedError') {
        setQrScanMessage('Camera permission denied. Enable camera in browser settings.');
      } else {
        setQrScanMessage('Failed to access camera');
      }
      console.error('[pos] Camera access error:', err);
    }
  }, []);

  const stopQRScan = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setQrScanStatus('idle');
    setQrScanMessage('');
  }, []);

  // ─── Camera Modal Effect ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cameraOpen) {
      const timer = setTimeout(() => {
        startQRScan();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [cameraOpen, startQRScan]);

  // ─── Payment QR Code Generation ────────────────────────────────────────────────────────

  const handleGeneratePaymentQr = async () => {
    if (!selectedSaleId || cart.length === 0) return;
    setPaymentLinkStatus('generating');
    try {
      const itemIds = cart.filter(c => c.itemId).map(c => c.itemId!);
      const res = await api.post<{ linkId: string; qrCodeDataUrl: string }>('/pos/payment-links', {
        saleId: selectedSaleId,
        amount: cartTotal,
        itemIds,
      });
      setPaymentLinkId(res.data.linkId);
      setPaymentLinkQr(res.data.qrCodeDataUrl); // base64 data URL
      setPaymentLinkStatus('waiting');
    } catch (err) {
      console.error('[pos] QR generation error:', err);
      setPaymentLinkStatus('idle');
      setErrorMessage('Failed to generate QR code');
    }
  };

  // ─── Invoice Sending ──────────────────────────────────────────────────────────────────

  const handleSendInvoice = async (reservationId: string, shopperEmail: string) => {
    try {
      await api.post(`/pos/holds/${reservationId}/invoice`, { deliverVia: 'EMAIL' });
      setHolds(prev => prev.filter(h => h.reservationId !== reservationId));
      showToast(`Invoice sent to ${shopperEmail}`, 'success');
    } catch (err) {
      console.error('[pos] Send invoice error:', err);
      setErrorMessage('Failed to send invoice');
    }
  };

  // ─── Linked Cart Addition ─────────────────────────────────────────────────────────────

  const handleAddLinkedCart = async (sessionId: string, cartItems: LinkedCart['cartItems']) => {
    try {
      await api.post(`/pos/sessions/${sessionId}/pull`);
      // Add items to cart
      cartItems.forEach(item => {
        addToCart({
          title: item.title,
          amount: item.price,
        });
      });
      showToast(`${cartItems.length} item${cartItems.length !== 1 ? 's' : ''} added to cart`, 'success');
    } catch (err) {
      console.error('[pos] Add linked cart error:', err);
      setErrorMessage('Failed to add items from linked cart');
    }
  };

  // ─── Reader status badge ───────────────────────────────────────────────────────────────────

  const readerBadge = {
    idle: { label: 'Reader not connected', color: 'bg-warm-200 text-warm-700' },
    connecting: { label: 'Connecting…', color: 'bg-amber-100 text-amber-700' },
    connected: { label: '● Reader connected', color: 'bg-emerald-100 text-emerald-700' },
    disconnected: { label: 'Reader disconnected', color: 'bg-red-100 text-red-700' },
    error: { label: 'Reader error', color: 'bg-red-100 text-red-700' },
  }[readerStatus];

  if (loading || !user) return null;

  // ─── Render ──────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>Point of Sale | FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 font-fraunces">POS</h1>
          <p className="text-sm text-warm-500 dark:text-warm-400">In-person payments</p>
        </div>
        {(readerStatus === 'idle' || readerStatus === 'error' || readerStatus === 'disconnected') ? (
          <button
            onClick={initTerminal}
            className={`text-xs px-3 py-1 rounded-full font-medium cursor-pointer hover:opacity-80 transition ${readerBadge.color}`}
          >
            {readerBadge.label}
          </button>
        ) : readerStatus === 'connecting' ? (
          <span className={`text-xs px-3 py-1 rounded-full font-medium animate-pulse ${readerBadge.color}`}>
            Connecting…
          </span>
        ) : (
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${readerBadge.color}`}>
            {readerBadge.label}
          </span>
        )}
      </div>

      {/* Sale selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">Sale</label>
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
            className="w-full border border-warm-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-sage-500"
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
          <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">Add items</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder="Search by title or SKU…"
              className="flex-1 border border-warm-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-sage-500"
            />
            <button
              onClick={() => {
                setCameraOpen(true);
              }}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 transition"
              title="Scan QR code on price label"
            >
              📷
            </button>
          </div>

          {searchResults.length > 0 && (
            <ul className="mt-1 border border-warm-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm divide-y divide-warm-100 dark:divide-gray-700 max-h-40 overflow-y-auto">
              {searchResults.map(item => (
                <li key={item.id}>
                  <button
                    onClick={() => addToCart(item)}
                    className="w-full text-left px-3 py-2 hover:bg-warm-50 dark:hover:bg-gray-700 flex items-center justify-between"
                  >
                    <span className="text-sm text-warm-900 dark:text-warm-100 truncate">{item.title}</span>
                    <span className="text-sm font-semibold text-sage-700 ml-2 shrink-0">
                      +${item.price?.toFixed(2) ?? '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {itemSearch.trim().length > 1 && searchResults.length === 0 && (
            <p className="mt-1 text-xs text-warm-400 dark:text-warm-500 italic">No available items match that search.</p>
          )}
        </div>
      )}

      {/* Quick-add misc buttons */}
      {selectedSaleId && (
        <div className="mb-4">
          <p className="text-xs font-medium text-warm-600 dark:text-warm-400 mb-2">Quick add misc items:</p>
          <div className="grid grid-cols-3 gap-2">
            {[0.25, 0.5, 1.0, 2.0, 5.0, 10.0].map(amount => (
              <button
                key={amount}
                onClick={() => quickAddMisc(amount)}
                className="py-2 rounded-lg bg-warm-200 dark:bg-gray-700 hover:bg-warm-300 dark:hover:bg-gray-600 text-warm-800 dark:text-warm-200 text-sm font-semibold transition"
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
            setNumpadOpen(prev => !prev);
            setNumpadValue('');
          }}
          className="w-full mb-4 py-2 rounded-lg bg-warm-100 dark:bg-gray-800 border border-warm-300 dark:border-gray-700 text-warm-700 dark:text-warm-300 text-sm font-medium hover:bg-warm-200 dark:hover:bg-gray-700 transition"
        >
          Custom amount
        </button>
      )}

      {/* Numpad (price / custom amount only) */}
      {numpadOpen && (
        <div className="mb-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 shadow-md">
          <div className="mb-3 p-2 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 text-center">
            <p className="text-xs text-warm-600 dark:text-warm-400">Custom Amount</p>
            <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
              ${(parseInt(numpadValue || '0', 10) / 100).toFixed(2)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1 mb-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'backspace'].map(key => (
              <button
                key={key}
                onClick={() => handleNumpadKey(key)}
                className="py-2 rounded-lg bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 text-sm font-semibold transition active:bg-warm-300 dark:active:bg-gray-600"
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
              className="flex-1 py-2 rounded-lg bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-warm-300 text-sm font-medium hover:bg-warm-300 dark:hover:bg-gray-600 transition"
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

      {/* Open Carts Dashboard */}
      {selectedSaleId && (
        <PosOpenCarts linkedCarts={linkedCarts} onPullCart={handleAddLinkedCart} />
      )}

      {/* Cart display */}
      {cart.length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-sage-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-3">Cart ({cart.length})</h3>
          <ul className="space-y-2 mb-3 max-h-48 overflow-y-auto">
            {cart.map(item => (
              <li
                key={item.id}
                className="flex items-center justify-between p-2 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-100 dark:border-gray-600"
              >
                <div className="min-w-0 flex-1">
                  {item.photoUrl && (
                    <img
                      key={item.photoUrl}
                      src={item.photoUrl}
                      alt={item.title}
                      className="w-8 h-8 rounded mb-1 object-cover"
                    />
                  )}
                  <p className="text-sm text-warm-900 dark:text-warm-100 truncate">{item.title}</p>
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

          <div className="border-t border-warm-200 dark:border-gray-700 pt-3 text-sm">
            <div className="flex justify-between font-semibold text-warm-900 dark:text-warm-100 mb-1">
              <span>Total:</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Buyer email */}
      {cart.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
            Buyer email <span className="text-warm-400 dark:text-warm-500 font-normal">(optional — for receipt)</span>
          </label>
          <input
            type="email"
            value={buyerEmail}
            onChange={e => setBuyerEmail(e.target.value)}
            placeholder="buyer@email.com"
            className="w-full border border-warm-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-sage-500"
          />
        </div>
      )}

      {/* Payment method selector (2×2 grid) */}
      {selectedSaleId && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-warm-700 dark:text-warm-300 mb-3">How are they paying?</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setPaymentMode('cash');
                setCashReceived(0);
                setCashNumpadValue('');
              }}
              className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 ${
                paymentMode === 'cash'
                  ? 'bg-sage-700 text-white'
                  : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-xl">💵</span>
              <span className="text-xs">Cash</span>
            </button>
            <button
              onClick={() => setPaymentMode('qr')}
              disabled={cart.length === 0}
              className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 ${
                paymentMode === 'qr'
                  ? 'bg-sage-700 text-white'
                  : cart.length === 0
                  ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-xl">📲</span>
              <span className="text-xs">Stripe QR</span>
            </button>
            <button
              onClick={() => {
                if (readerStatus !== 'connected') return;
                setPaymentMode('card');
                setNumpadOpen(false);
              }}
              disabled={readerStatus !== 'connected'}
              title={readerStatus !== 'connected' ? 'Tap the status indicator in the top corner to connect your reader' : ''}
              className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 ${
                paymentMode === 'card' && readerStatus === 'connected'
                  ? 'bg-sage-700 text-white'
                  : readerStatus !== 'connected'
                  ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-xl">💳</span>
              <span className="text-xs">Card Reader</span>
            </button>
            <button
              onClick={() => setPaymentMode('invoice')}
              disabled={!holds || holds.length === 0}
              title={!holds || holds.length === 0 ? 'No active holds' : ''}
              className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 ${
                paymentMode === 'invoice'
                  ? 'bg-sage-700 text-white'
                  : !holds || holds.length === 0
                  ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-xl">📧</span>
              <span className="text-xs">Invoice</span>
            </button>
          </div>
          {/* Manual card entry link (below Card Reader button) */}
          <div className="mt-2">
            <button
              onClick={() => {
                setPaymentMode('manual_card');
                setNumpadOpen(false);
              }}
              className="text-xs text-sage-700 dark:text-sage-400 hover:underline"
            >
              No reader? Enter card manually
            </button>
          </div>
        </div>
      )}

      {/* Payment Method: Manual Card Entry */}
      {paymentMode === 'manual_card' && cart.length > 0 && (
        <Elements stripe={getStripePromise()}>
          <PosManualCard
            cartTotal={cartTotal}
            cart={cart}
            selectedSaleId={selectedSaleId}
            buyerEmail={buyerEmail}
            onSuccess={(message) => {
              showToast(message, 'success');
              handleNewTransaction();
            }}
            onError={(message) => {
              showToast(message, 'error');
            }}
          />
        </Elements>
      )}

      {/* Payment Method: QR Code */}
      {paymentMode === 'qr' && cart.length > 0 && (
        <PosPaymentQr
          cartTotal={cartTotal}
          paymentLinkId={paymentLinkId}
          paymentLinkQr={paymentLinkQr}
          paymentLinkStatus={paymentLinkStatus}
          onGenerate={handleGeneratePaymentQr}
          onNewTransaction={handleNewTransaction}
          onReset={handleResetPaymentQr}
        />
      )}

      {/* Payment Method: Invoice/Holds */}
      {paymentMode === 'invoice' && (
        <div className="mb-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-3">📧 Send Invoice</h4>

          {holdsLoading && <p className="text-sm text-warm-600 dark:text-warm-400">Loading holds…</p>}

          {!holdsLoading && holds.length === 0 && (
            <p className="text-sm text-warm-600 dark:text-warm-400">No active holds for this sale.</p>
          )}

          {!holdsLoading && holds.length > 0 && (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {holds.map(hold => (
                <div
                  key={hold.reservationId}
                  className="p-3 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{hold.shopperName}</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400">{hold.shopperEmail}</p>
                    </div>
                    <span className="text-sm font-bold text-sage-700">${(hold.itemPrice / 100).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-warm-600 dark:text-warm-400 mb-2">{hold.itemTitle}</p>
                  <button
                    onClick={() => setInvoiceModalHold(hold)}
                    className="w-full py-2 rounded-lg bg-sage-700 text-white text-xs font-semibold hover:bg-sage-800 transition"
                  >
                    Send Invoice →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error / success messages */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          {errorMessage}
        </div>
      )}

      {successMessage && paymentStatus === 'success' && (
        <div className="mb-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-400 text-sm font-medium">
          {successMessage}
          
          {/* Cash fee details section */}
          {paymentMode === 'cash' && lastCashFee && (
            <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-emerald-700 dark:text-emerald-400">Platform fee:</span>
                <span className="font-semibold text-emerald-900 dark:text-emerald-300">${lastCashFee.platformFee.toFixed(2)}</span>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 italic">This fee will be deducted from your next payout.</p>
              {lastCashFee.cashFeeBalance > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    <span className="font-semibold">Pending fee balance:</span> ${lastCashFee.cashFeeBalance.toFixed(2)} total
                  </p>
                </div>
              )}
            </div>
          )}
          
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
          {/* Card payment button */}
          {paymentMode === 'card' && (
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
                  className="w-full py-2 rounded-xl border border-warm-300 dark:border-gray-700 text-warm-600 dark:text-warm-400 text-sm hover:bg-warm-100 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
              )}
            </>
          )}

          {/* Cash payment numpad and button */}
          {paymentMode === 'cash' && (
            <>
              {/* Inline cash received numpad */}
              <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-warm-700 dark:text-warm-300">Cash Received</p>
                  <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                    ${(parseInt(cashNumpadValue || '0', 10) / 100).toFixed(2)}
                  </p>
                </div>

                {cashNumpadValue.length > 0 && (
                  <div
                    className={`mb-3 p-2 rounded-lg text-center ${
                      cashReceived >= cartTotal
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600'
                    }`}
                  >
                    <p
                      className={`text-sm font-semibold ${
                        cashReceived >= cartTotal ? 'text-emerald-700 dark:text-emerald-400' : 'text-warm-500 dark:text-warm-400'
                      }`}
                    >
                      {cashReceived >= cartTotal
                        ? `Change: $${cartChange.toFixed(2)}`
                        : `Short $${(cartTotal - cashReceived).toFixed(2)}`}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-1">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'backspace'].map(key => (
                    <button
                      key={key}
                      onClick={() => {
                        if (key === 'backspace') {
                          setCashNumpadValue(prev => prev.slice(0, -1));
                        } else {
                          setCashNumpadValue(prev => prev + key);
                        }
                      }}
                      className="py-3 rounded-lg bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 text-sm font-semibold transition active:bg-warm-300 dark:active:bg-gray-600"
                    >
                      {key === 'backspace' ? '⌫' : key}
                    </button>
                  ))}
                </div>
              </div>

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
        <p className="mt-4 text-xs text-warm-400 dark:text-warm-500 text-center">
          Platform fee (10%) applied. Net payout: ~${(cartTotal * 0.9 * 0.971).toFixed(2)} after Stripe fees.
        </p>
      )}

      {/* POS Value Unlock Tiers */}
      {!posTierLoading && posTierStatus && (
        <PosTierGates
          tier={posTierStatus.tier}
          transactionCount={posTierStatus.transactionCount}
          totalRevenue={posTierStatus.totalRevenue}
          nextGate={posTierStatus.nextGate}
        />
      )}

      {/* Back link */}
      <div className="mt-8 text-center">
        <a href="/organizer/dashboard" className="text-sm text-warm-400 dark:text-warm-500 hover:text-warm-600 dark:hover:text-warm-400">
          ← Back to Dashboard
        </a>
      </div>
      </div>

      {/* Invoice Modal */}
      {invoiceModalHold && (
        <PosInvoiceModal
          hold={invoiceModalHold}
          onClose={() => setInvoiceModalHold(null)}
          onSent={(reservationId) => {
            setHolds(prev => prev.filter(h => h.reservationId !== reservationId));
            setInvoiceModalHold(null);
          }}
        />
      )}

      {/* QR Scan Camera Modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col items-center justify-center">
          <div className="w-full h-full max-w-md max-h-screen flex flex-col items-center justify-center p-4 relative">
            <button
              onClick={stopQRScan}
              className="absolute top-4 right-4 z-50 text-white text-2xl hover:text-gray-300 transition"
              aria-label="Close camera"
            >
              ✕
            </button>

            <div className="relative w-full">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full rounded-lg"
                style={{ minHeight: '200px' }}
              />
              <canvas ref={canvasRef} className="hidden" />

              {qrScanStatus === 'scanning' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 border-2 border-green-500 rounded-lg opacity-50" />
                </div>
              )}

              {qrScanStatus === 'error' && qrScanMessage && (
                <div className="absolute bottom-0 left-0 right-0 bg-red-600 text-white p-2 text-xs rounded-b-lg text-center">
                  {qrScanMessage?.includes('permission') || qrScanMessage?.includes('denied')
                    ? 'Camera access denied. Please allow camera access in your browser settings and try again.'
                    : qrScanMessage}
                </div>
              )}

              {qrScanStatus === 'found' && (
                <div className="absolute bottom-0 left-0 right-0 bg-green-600 text-white p-2 text-xs rounded-b-lg text-center">
                  ✓ {qrScanMessage}
                </div>
              )}
            </div>

            <p className="mt-4 text-white text-center text-sm">
              Point at the white QR tag on the price label
            </p>
          </div>
        </div>
      )}
    </>
  );
}
