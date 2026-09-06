/**
 * /organizer/pos: Stripe Terminal POS v2
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import jsQR from 'jsqr';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useFeedbackSurvey } from '../../hooks/useFeedbackSurvey';
import ConfirmDialog from '../../components/ConfirmDialog';
import api from '../../lib/api';
import PosTierGates from '../../components/PosTierGates';
import PosInvoiceModal from '../../components/PosInvoiceModal';
import PosOpenCarts from '../../components/PosOpenCarts';
import PosPaymentQr from '../../components/PosPaymentQr';
import PosManualCard from '../../components/PosManualCard';
import { PosTierStatus } from '../../lib/types/posTiers';
import QRCode from 'react-qr-code';

// Generate a client transaction id for POS card-payment idempotency (double-tap / retry
// guard -- see handleCharge). Prefers crypto.randomUUID() (matches backend
// Purchase.clientTransactionId expectation, same convention as offlineSync.ts's
// generateClientTransactionId); falls back to a timestamp+random scheme on older browsers
// without Web Crypto support.
function generateClientTransactionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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
  draftStatus?: string | null;
  photoUrls: string[];
  sku: string | null;
}

// Hub-wide venue search result (S1178 follow-up, 2026-07-31) -- searchHubCartItems
// returns everything Item does plus which booth each item belongs to, so the cashier
// can tell apart same-titled items at different vendors' booths before adding one to
// the cart. status is synthesized as 'AVAILABLE' (the endpoint only ever returns
// AVAILABLE items) so this is structurally an Item and can be passed straight into
// addToCart/addVenueItemToCart unchanged.
interface HubSearchItem extends Item {
  vendorBoothId: string | null;
  vendorName: string | null;
  boothNumber: string | null;
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
type PaymentMode = 'card' | 'manual_card' | 'cash' | 'qr' | 'invoice' | 'phone' | 'venmo' | 'zelle';
type NumpadMode = 'price';

// 2026-08-24 (Patrick decision, corrected after initial mix-up with cash/card split-tender --
// see STATE.md): hides the multi-person Split Bill feature (#406/#408) from the POS UI while
// keeping all state/logic intact for a one-flag re-enable when organizers ask for it. Does NOT
// touch the cash+card split-tender ('Send to Phone') feature -- that stays live, untouched.
const ENABLE_SPLIT_BILL = false;

interface CashPaymentResponse {
  platformFee: number;
  cashFeeBalance: number;
  // Test Transaction safety net UI (2026-08-29): backend returns this so the success
  // panel can say honestly whether the displayed fee/balance below actually moved.
  isTestTransaction?: boolean;
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
  shopperId: string;
  shopperName: string;
  shopperEmail: string;
  cartItems: Array<{ id: string; title: string; price: number; photoUrl?: string; saleId: string }>;
  cartTotal: number;
  createdAt: string;
}

interface PendingPayment {
  id: string;
  shopperName: string;
  totalAmountCents: number;
  displayAmount: string;
  status: 'PENDING' | 'ACCEPTED';
  expiresAt: string;
  isExpired: boolean;
  isSplitPayment?: boolean;
  cashAmountCents?: number;
  cardAmountCents?: number;
  cardDisplayAmount?: string;
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

// ─── Venue-mode query helper (S1178 hard-nav fix, 2026-07-30) ───────────────────────
// router.query.venue/boothToken is unreliable on the very first client render(s) of
// this page after a genuine hard navigation (full page load / typed URL / bookmark).
// This route is automatically statically optimized (no getServerSideProps/
// getStaticProps -- confirmed via `window.__NEXT_DATA__.nextExport === true` and
// `query: {}` in a live hard-nav test, 2026-07-30), and on that path Next's Pages
// Router does not reliably drive a fresh React re-render of this component at the
// exact moment router.query catches up to the real URL -- router.isReady does flip to
// true and does cause a re-render (confirmed: the auth-guard effect below reacts to it
// correctly), but by relying on router.query.venue for the VALUE at that render this
// component could still read a stale/empty query. window.location.search, read
// directly, was confirmed live to be correct immediately on load in every case tested
// (hard nav AND client-side router.push transitions -- history.pushState updates
// location.search synchronously), so read the URL directly instead of trusting
// router.query for this specific gate. router.query.venue/boothToken are kept as a
// fallback for the (non-browser / SSR-adjacent) case where window is unavailable.
function readVenueQueryParams(router: { query: { venue?: string | string[]; boothToken?: string | string[] } }): { venueHubId: string | null; boothToken: string | null } {
  let venue: string | null = null;
  let boothToken: string | null = null;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    venue = params.get('venue');
    boothToken = params.get('boothToken');
  }
  if (!venue) {
    const v = router.query.venue;
    venue = typeof v === 'string' && v ? v : null;
  }
  if (!boothToken) {
    const t = router.query.boothToken;
    boothToken = typeof t === 'string' && t ? t : null;
  }
  return { venueHubId: venue, boothToken };
}

// ─── Component ─────────────────────────────────────────────────────────────────────

export default function POSPage() {
  const { user, isLoading: loading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const { showSurvey } = useFeedbackSurvey();
  const queryClient = useQueryClient();

  // Sale + item state
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  // Terminal readiness fix (2026-08-08): onFetchConnectionToken below is created once
  // inside initTerminal (a useCallback with an empty dep array) and can be invoked by the
  // Stripe Terminal SDK again later (e.g. token refresh) without initTerminal re-running --
  // a plain closed-over selectedSaleId would go stale if the organizer switches sales after
  // connecting the reader. This ref is kept in sync via the effect below and read inside
  // that closure instead.
  const selectedSaleIdRef = useRef(selectedSaleId);
  useEffect(() => {
    selectedSaleIdRef.current = selectedSaleId;
  }, [selectedSaleId]);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [buyerEmail, setBuyerEmail] = useState('');

  // POS Cashier Discount Permission (2026-08-28): populated from /pos/context.
  // canApplyDiscount false => discount control must not render at all (per UX spec --
  // absence, not a disabled control, is the correct signal for a cashier without the
  // permission). discountCap null = uncapped (or not applicable to this actor).
  const [canApplyDiscount, setCanApplyDiscount] = useState(false);
  const [discountCap, setDiscountCap] = useState<{ type: 'PERCENT' | 'FIXED'; value: number } | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [discountValueInput, setDiscountValueInput] = useState('');
  const [discountReasonNote, setDiscountReasonNote] = useState('');

  // BQ fix (2026-07-29): moved up from its original spot further down in this
  // component (was a plain `const cartTotal = ...` right before the numpad-ops
  // section) -- the S1178 venue-mode useCallback added tonight references
  // cartTotal in its dependency array and is declared earlier in the component
  // than the original cartTotal line, causing a real "used before its
  // declaration" TypeScript compile error (block-scoped const, not hoisted).
  // Only cartTotal itself needed to move -- cartChange/cardAmount (which derive
  // from cartTotal) stay at their original location, nothing else references
  // them before that point.
  //
  // POS Cashier Discount Permission (2026-08-28): cartTotal is now the DISCOUNTED
  // total (cartSubtotal minus the clamped, permission-gated discount) -- every
  // existing downstream usage of cartTotal (display, cash-split math, the
  // /pos/payment-request totalAmountCents payload) picks up the discount automatically
  // with no per-call-site changes needed. The one path that must NOT use this reduced
  // number is the /stripe/terminal/payment-intent `items` payload, which is built from
  // raw `cart` (per-item, undiscounted) -- the backend applies the discount itself from
  // the separate discountType/discountValue fields sent alongside it. See
  // claude_docs/feature-notes/ADR-pos-cashier-discount-permission.md.
  const cartSubtotal = cart.reduce((sum, c) => sum + c.amount, 0);
  const discountValueNum = parseFloat(discountValueInput) || 0;
  const rawDiscountAmount =
    discountType === 'PERCENT' ? (discountValueNum / 100) * cartSubtotal : discountValueNum;
  const discountCapDollars = discountCap
    ? (discountCap.type === 'PERCENT' ? (discountCap.value / 100) * cartSubtotal : discountCap.value)
    : null;
  const discountExceedsCap = discountCapDollars != null && rawDiscountAmount > discountCapDollars;
  const discountAmount = Math.max(
    0,
    Math.min(rawDiscountAmount, discountCapDollars ?? Infinity, cartSubtotal)
  );
  const cartTotal = Math.max(0, cartSubtotal - discountAmount);
  // Bug found live 2026-08-28 (POS Cashier Discount Permission re-verification, cash path):
  // every discount POST body below sent the RAW discountValueNum (e.g. 25) even when it
  // exceeded the cap, while this panel's own "Max for your role is X%. Applying $Y instead."
  // message (rendered further down) implied the capped amount would be what's actually
  // charged. resolvePosDiscount (posDiscountService.ts) does NOT auto-clamp an over-cap
  // value server-side -- it hard-rejects with 400 "Max discount for your role is X%." So
  // every over-cap discount attempt failed checkout entirely instead of applying the
  // displayed clamped amount. This bug predates this session (already present in the
  // card-path payload at ~line 1584 before this fix) -- surfaced now because the cash path
  // (fixed this session) finally started validating server-side too. Fix: when the discount
  // type matches the cap's type, clamp the submitted value to the cap so the request matches
  // what the UI already promised. A type MISMATCH (e.g. FIXED input against a PERCENT cap)
  // still hard-rejects server-side either way -- that's a real "wrong discount type for this
  // workspace's cap" case, not something a client-side clamp can silently paper over.
  const discountValueToSubmit =
    discountCap && discountType === discountCap.type
      ? Math.min(discountValueNum, discountCap.value)
      : discountValueNum;

  // Numpad state (price / custom amount only)
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadValue, setNumpadValue] = useState('');
  const [numpadMode] = useState<NumpadMode>('price');

  // Payment state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('card');
  const [cashReceived, setCashReceived] = useState(0);
  const [cashNumpadValue, setCashNumpadValue] = useState('');
  // Test Transaction safety net UI (2026-08-29): organizer-facing toggle for the
  // backend isTestTransaction flag (terminalController.processCashSaleCore). Only
  // wired into the cash/Venmo/Zelle path -- the card/Stripe-terminal path and the
  // venue/booth-cart path (handleVenueCashPayment) do not accept this flag server-side,
  // so the control is intentionally only rendered for paymentMode cash/venmo/zelle in
  // the non-venue flow. Reset on every clearCart() so it can never silently persist
  // into the next real sale.
  const [isTestTransaction, setIsTestTransaction] = useState(false);

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
  const [paymentLinkUrl, setPaymentLinkUrl] = useState(''); // payment link URL for copy button
  const [paymentLinkAmount, setPaymentLinkAmount] = useState(0); // actual amount being charged
  const [paymentLinkStatus, setPaymentLinkStatus] = useState<'idle' | 'generating' | 'waiting' | 'paid'>('idle');
  const [paymentLinkPollInterval, setPaymentLinkPollInterval] = useState<NodeJS.Timeout | null>(null);


  // Linked Shopper QR state (shopper account QR scan)
  const [linkedShopperData, setLinkedShopperData] = useState<any | null>(null);
  // Track the shopper userId for Send to Phone (set from QR scan or cart pull)
  const [linkedShopperId, setLinkedShopperId] = useState<string | null>(null);

  // Invoice/Holds state
  const [holds, setHolds] = useState<HoldItem[]>([]);
  const [holdsLoading, setHoldsLoading] = useState(false);
  const [invoiceModalHold, setInvoiceModalHold] = useState<HoldItem | null>(null);
  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const [loadedHold, setLoadedHold] = useState<HoldItem | null>(null);
  const [holdsRefreshInterval, setHoldsRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  // ADR-114 POS_CART fix (2026-08-31): guards the `holdReservationIds` query-param effect
  // below against double-handling -- see that effect's comment for the full story.
  const handledHoldReservationIdsRef = useRef<string | null>(null);
  const [cancellingSalesId, setCancellingSalesId] = useState<string | null>(null);
  // Cart share request: tracks whether organizer has requested the shopper share their cart
  const [cartShareRequesting, setCartShareRequesting] = useState(false);
  const [cartShareSent, setCartShareSent] = useState(false);

  // Shopper lookup state
  const [shopperSearchEmail, setShopperSearchEmail] = useState('');
  const [shopperSearchResults, setShopperSearchResults] = useState<HoldItem[]>([]);
  const [shopperSearchLoading, setShopperSearchLoading] = useState(false);

  // Open Carts state
  const [linkedCarts, setLinkedCarts] = useState<LinkedCart[]>([]);
  const [linkedCartsPollInterval, setLinkedCartsPollInterval] = useState<NodeJS.Timeout | null>(null);

  // Pending Payments state
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const pendingPaymentsRef = useRef<PendingPayment[]>([]);
  const prevActivePendingRef = useRef<PendingPayment[]>([]);
  const cancelledRequestIdsRef = useRef<Set<string>>(new Set());
  const [pendingPaymentsPanelOpen, setPendingPaymentsPanelOpen] = useState(true);
  const [successPaymentId, setSuccessPaymentId] = useState<string | null>(null);

  // Paid banner state (slide-in success notification)
  const [paidBanner, setPaidBanner] = useState<{ shopperName: string; displayAmount: string } | null>(null);

  // Cash calculator state
  const [cashCalculatorVisible, setCashCalculatorVisible] = useState(false);

  // Pending payment cancel state
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Sound toggle state (persisted in localStorage)
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Split-bill state (#406)
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [splitCollected, setSplitCollected] = useState<boolean[]>([]);
  const [splitMode, setSplitMode] = useState<'even' | 'custom'>('even');
  const [splitCustomAmounts, setSplitCustomAmounts] = useState<string[]>([]);

  // Organizer profile (venmo/zelle handles for POS payment modes)
  const [organizerVenmo, setOrganizerVenmo] = useState<string | null>(null);
  const [organizerZelle, setOrganizerZelle] = useState<string | null>(null);

  // ─── Venue mode (S1178, Priority 1) ────────────────────────────────────────────────
  // Entered via ?venue=<hubId>. STAFF/OWNER only in this pass -- both auth branches ride
  // the same workspace/organizer JWT the `api` client already attaches, so no new
  // credential handling is needed here. A vendor checking out from their OWN device via
  // X-Booth-Token has NO frontend anywhere in this repo today (verified this session) --
  // that is a separate, larger build, flagged in the S1178 dev handoff, not attempted here.
  const [venueHubId, setVenueHubId] = useState<string | null>(null);
  // Vendor-booth-token credential (2026-07-29, Patrick's decision + ADR-095 follow-up):
  // present ONLY when a vendor arrived via MyVendorBoothsCard's "Open the register" link
  // (?venue=<hubId>&boothToken=<token>). When set, every venue-mode cart call below sends
  // X-Booth-Token instead of relying on the workspace/organizer JWT the TEAM_MEMBER/HUB_OWNER
  // path already uses. The backend (requireBoothAuth.ts) enforces both claim AND the
  // separate registerAccessGrantedAt grant -- this page does not duplicate that check, it
  // just attempts the credential and surfaces whatever 403 message comes back (already
  // wired via venueStartFailure below).
  const [venueBoothToken, setVenueBoothToken] = useState<string | null>(null);
  const [venueCart, setVenueCart] = useState<{ id: string; hubId: string; status: string } | null>(null);
  const [venueStartFailure, setVenueStartFailure] = useState<string | null>(null);
  // Hub-wide item search (S1178 follow-up, 2026-07-31): venue mode has no
  // selectedSaleId, so the plain "Search by title or SKU" block further down
  // (gated on selectedSaleId) never rendered here -- this is venue mode's own
  // equivalent, hitting searchHubCartItems instead of /items?saleId=.
  const [venueItemSearch, setVenueItemSearch] = useState('');
  const [venueSearchResults, setVenueSearchResults] = useState<HubSearchItem[]>([]);
  const [venueBooths, setVenueBooths] = useState<Array<{
    vendorBoothId: string;
    vendorName: string;
    boothNumber: string;
    subtotalCents: number;
    readyForStandardCharge: boolean;
  }>>([]);
  const [venueBoothOutcomes, setVenueBoothOutcomes] = useState<Record<string, 'pending' | 'connecting' | 'ready' | 'tapping' | 'authorized' | 'failed'>>({});
  const [venueCheckoutOpen, setVenueCheckoutOpen] = useState(false);
  const [venueCheckoutFailure, setVenueCheckoutFailure] = useState<string | null>(null);
  const [venueCapturing, setVenueCapturing] = useState(false);
  const [venueCaptureFailed, setVenueCaptureFailed] = useState(false);
  const venueTerminalRef = useRef<any>(null);

  // ─── Venue mode: Stripe QR rail state (S1178 follow-up, Task 3, 2026-07-31) ────────
  // Reuses the EXISTING createBoothCartQrSetupIntent / authorizeBoothCartQrLegs backend
  // endpoints (built for this exact multi-vendor-split purpose) plus the register-side
  // "generate -> display QR -> poll -> done" shape already proven by the non-venue
  // paymentLink* QR flow above (same react-qr-code component, same 3s poll interval).
  const [venueQrStatus, setVenueQrStatus] = useState<'idle' | 'generating' | 'waiting' | 'confirmed'>('idle');
  const [venueQrClientSecret, setVenueQrClientSecret] = useState('');
  const [venueQrSetupIntentId, setVenueQrSetupIntentId] = useState('');
  const [venueQrUrl, setVenueQrUrl] = useState('');

  // Stripe Terminal SDK ref
  const terminalRef = useRef<any>(null);
  // POS card-terminal idempotency (double-tap / retry guard): one token per cart "attempt" --
  // generated lazily on first Charge tap in handleCharge, persists across retries of the SAME
  // cart (network error, double-tap), reset whenever the cart contents actually change
  // (addToCart / removeFromCart / clearCart) or the in-flight attempt is explicitly cancelled
  // (handleCancel) since a cancelled PaymentIntent can never be reused.
  const clientTransactionIdRef = useRef<string | null>(null);
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
    enabled: !!user, // S1183 Fix 1: backend (resolveOrganizerOrTeamMember) is the real gate now
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch POS context: sales + venmo/zelle handles (S1183 Fix 1). Single call replaces
  // the former /sales/mine + /organizers/me fetches (both wide-blast-radius endpoints
  // used well beyond POS and never going to recognize a TEAM_MEMBER register operator).
  // Backend is the real gate now (resolveOrganizerOrTeamMember) -- this only needs
  // !!user, not a client-side ORGANIZER role check, so an authenticated TEAM_MEMBER
  // with register access reaches this too and is cleanly rejected downstream if not.
  useEffect(() => {
    if (!user) return;
    api.get<{ actorKind?: string; organizerId?: string; sales?: Sale[]; venmoHandle?: string | null; zelleHandle?: string | null; canApplyDiscount?: boolean; discountCap?: { type: 'PERCENT' | 'FIXED'; value: number } | null }>('/pos/context')
      .then(r => {
        setOrganizerVenmo(r.data.venmoHandle || null);
        setOrganizerZelle(r.data.zelleHandle || null);
        const all: Sale[] = r.data.sales ?? [];
        const active = all.filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i); // dedup by id
        setSales(active);
        if (active.length === 1 && !venueHubId) setSelectedSaleId(active[0].id);
        // POS Cashier Discount Permission (2026-08-28)
        setCanApplyDiscount(!!r.data.canApplyDiscount);
        setDiscountCap(r.data.discountCap ?? null);
      })
      .catch(err => console.error('[pos] Failed to load POS context:', err));
  }, [user, venueHubId]);

  // Pending Payments polling
  const { data: activePendingPayments = [] } = useQuery<PendingPayment[]>({
    queryKey: ['pos-active-payment-requests'],
    queryFn: async () => {
      const res = await api.get<PendingPayment[]>('/pos/payment-requests/active');
      return res.data;
    },
    enabled: !!user, // S1183 Fix 1: backend (resolveOrganizerOrTeamMember) is the real gate now
    refetchInterval: (query) => {
      // Socket handles real-time updates: poll only as a fallback every 5s
      const d = (query as any).state?.data as PendingPayment[] | undefined;
      return d && d.length > 0 ? 5000 : false;
    },
    staleTime: 0, // Always refetch
  });

  // Update local state when query returns new data
  useEffect(() => {
    if (activePendingPayments) {
      const prev = prevActivePendingRef.current;

      // Polling-based flash fallback: detect when a PENDING/ACCEPTED payment disappears from the list.
      // Skip payments the cashier explicitly cancelled: those are NOT paid.
      // Verify actual status before showing the banner: disappearance could mean DECLINED, not PAID.
      if (prev.length > 0 && activePendingPayments.length < prev.length) {
        const disappeared = prev.filter(p =>
          !activePendingPayments.find(c => c.id === p.id) &&
          !cancelledRequestIdsRef.current.has(p.id)
        );
        if (disappeared.length > 0) {
          const candidate = disappeared[0];
          // Verify the actual terminal status before showing paid banner
          api.get<{ status: string }>(`/pos/payment-request/${candidate.id}`)
            .then(({ data }) => {
              if (data?.status === 'PAID') {
                setPaidBanner(current => current ? current : {
                  shopperName: candidate.shopperName,
                  displayAmount: candidate.displayAmount,
                });
                setCart([]);
                setBuyerEmail('');
                setLinkedShopperId(null);
                setLinkedShopperData(null);
                setSuccessMessage('');
                setPaymentStatus('idle');
              }
              // DECLINED or other terminal states: do nothing: no banner, no cart clear
            })
            .catch(() => {
              // If status check fails, don't show banner (safe default)
            });
        }
      }

      prevActivePendingRef.current = activePendingPayments;
      setPendingPayments(activePendingPayments);
      if (activePendingPayments.length > 0) {
        setPendingPaymentsPanelOpen(true);
      }
    }
  }, [activePendingPayments]);

  // ─── Initialize sound preference from localStorage ────────────────────────────────

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_sound_enabled');
      if (saved !== null) {
        setSoundEnabled(JSON.parse(saved));
      }
    }
  }, []);

  // ─── Keep pendingPayments ref in sync so socket handler always has latest list ────

  useEffect(() => {
    pendingPaymentsRef.current = pendingPayments;
  }, [pendingPayments]);

  // ─── Auto-dismiss paid banner after 5 seconds ──────────────────────────────────────

  useEffect(() => {
    if (!paidBanner) return;
    const timer = setTimeout(() => {
      setPaidBanner(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [paidBanner]);

  // ─── Auth guard ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // S1183 Fix 1 (2026-08-01): generalized from the earlier hasBoothToken/
    // hasVenueSession escape hatches (a vendor arriving via their own booth token, or
    // a TEAM_MEMBER/HUB_OWNER arriving via ?venue=<hubId>) into one rule -- bounce
    // unauthenticated visitors only, never a non-ORGANIZER authenticated user. That
    // covers every prior escape hatch plus plain non-venue POS's own new TEAM_MEMBER
    // register-access path (posAuth.ts), so the per-case boothToken/venue detection
    // above is no longer needed here. Do NOT try to detect "is this a team member"
    // client-side (User.roles never carries a TEAM_MEMBER marker -- that lives
    // entirely in WorkspaceMember/TeamMember joins). The backend
    // (resolveOrganizerOrTeamMember / requireBoothTokenOrTeamMember) is the real gate
    // now, and cleanly rejects (venueStartFailure, or a 403 from /pos/context and
    // friends) anyone who reaches a surface they don't actually have access to.
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  // ─── Pre-select sale from query param ────────────────────────────────────────────

  useEffect(() => {
    if (router.isReady && router.query.saleId && !venueHubId) {
      setSelectedSaleId(router.query.saleId as string);
    }
  }, [router.isReady, router.query.saleId, venueHubId]);

  // ─── Venue mode: parse ?venue=<hubId> ─────────────────────────────────────────────────────
  useEffect(() => {
    // S1179 hard-nav gate fix (2026-07-30): removed the `if (!router.isReady) return;`
    // gate that used to sit here -- it blocked readVenueQueryParams() (see above) from
    // ever running on a genuine hard navigation, since router.isReady was confirmed
    // live to never resolve true on this route in that case. readVenueQueryParams()
    // reads window.location.search directly and is safe to call immediately. Deps
    // (router.isReady, router.asPath, router.query.venue/boothToken) are kept so this
    // still re-runs correctly on a later client-side transition that changes the query
    // string, which was already working.
    const { venueHubId: v, boothToken: t } = readVenueQueryParams(router);
    setVenueHubId(v);
    setVenueBoothToken(t);
  }, [router.isReady, router.asPath, router.query.venue, router.query.boothToken]);

  // ─── Venue mode: lazily start-or-reuse the booth cart (2026-09-06 fix) ─────────────
  // REMOVED the eager useEffect that used to POST /cart/start the instant venueHubId (+
  // user) was known, unconditionally, on every mount/remount. That created a real
  // workflow trap found in today's QA: "Cancel this cart" (handleCancelVenueCart below)
  // correctly releases the cart, but ANY reload of this page (or re-mount under some nav
  // path) before "Close this market" immediately spun up a brand-new EMPTY PENDING cart
  // via that eager effect -- which re-trips the hub-close blocker (hubController.ts
  // hubHasCloseBlockers -> openCartCount, counted straight from BoothCartTransaction rows
  // with status PENDING, surfaced to the organizer as "N register sales are still open"
  // on /organizer/hubs/[hubId]/manage) even though nothing was ever rung up.
  //
  // ensureVenueCart replaces it: cart-start (or find-or-reuse, same backend contract as
  // before) now only fires the first time the cashier does something that actually needs
  // a cart. addVenueItemToCart -- the single cart-mutating entry point in venue mode (the
  // hub-wide search results list, the Enter-key exact-ID lookup, and the QR/barcode scan
  // handler all funnel through it; quick-add-misc and the custom-amount button don't
  // render in venue mode at all) -- calls this first. A cashier who never adds anything
  // never creates a cart, so "no active cart yet" is a normal resting state, not a
  // loading state or an error.
  //
  // venueCartStartRef dedups a fast double-tap / scanner double-fire that could otherwise
  // race two POST /cart/start calls before the first resolves -- every caller inside that
  // window awaits the SAME in-flight promise instead of starting a second one.
  //
  // Trade-off, stated plainly (in scope for this fix, not silently swallowed): the
  // "refresh mid-sale" cart rehydration (2026-08-01 fix, preserved below unchanged) now
  // only runs on the NEXT addVenueItemToCart call after a refresh, not immediately on
  // page load. A cashier who refreshes mid-sale and tries to charge without adding
  // anything else first will see an empty cart (charge/cash/QR buttons stay disabled via
  // the existing cart.length === 0 gate) until they add or re-add an item -- at which
  // point the server hands back the SAME PENDING cart with its previously-reserved items
  // and the hydrate step below repopulates them. Nothing is lost server-side either way
  // (items stay RESERVED against the existing PENDING cart); only the local UI's
  // visibility of them is delayed until the next add. A true zero-regression fix would
  // need a backend "peek an existing cart without creating one" endpoint, which does not
  // exist today and is out of scope for this pass.
  const venueCartStartRef = useRef<Promise<{
    cart: { id: string; hubId: string; status: string } | null;
    failureMessage: string | null;
  }> | null>(null);
  const ensureVenueCart = useCallback((): Promise<{
    cart: { id: string; hubId: string; status: string } | null;
    failureMessage: string | null;
  }> => {
    if (venueCart) return Promise.resolve({ cart: venueCart, failureMessage: null });
    if (!venueHubId) return Promise.resolve({ cart: null, failureMessage: 'No venue selected.' });
    if (venueCartStartRef.current) return venueCartStartRef.current;

    setVenueStartFailure(null);
    const attempt = api.post(
      `/organizer/hubs/${venueHubId}/cart/start`,
      { cashierType: 'TEAM_MEMBER' },
      venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
    )
      .then(res => {
        setVenueCart(res.data);
        // Refresh-during-sale fix (2026-08-01): startBoothCart now find-or-reuses an
        // existing PENDING cart for this cashier identity instead of always creating a
        // new one, so a page refresh mid-sale can hand back a cart that already has
        // RESERVED items on the server. Hydrate the local `cart` UI state from the
        // server's itemized contents so those items reappear instead of looking empty.
        return api.get(
          `/organizer/hubs/${venueHubId}/cart/${res.data.id}`,
          venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
        ).then(hydrateRes => {
          setCart(hydrateRes.data.items.map((i: any) => ({
            id: `${Date.now()}_${Math.random().toString(36).substring(7)}`,
            itemId: i.itemId,
            title: i.title,
            amount: i.price ?? 0,
            photoUrl: i.photoUrl,
          })));
          return { cart: res.data as { id: string; hubId: string; status: string }, failureMessage: null };
        });
      })
      .catch(err => {
        console.error('[pos] Failed to start venue cart:', err);
        // REGISTER_ACCESS_NOT_GRANTED (requireBoothAuth.ts) surfaces here with its own
        // clear message already -- this is exactly the "attempt the credential, handle a
        // 403 gracefully" contract the vendor-booth-token path is scoped to. No special
        // casing needed for that code specifically.
        const message = err?.response?.data?.error || err?.response?.data?.message || 'Failed to open the venue register.';
        setVenueStartFailure(message);
        return { cart: null, failureMessage: message };
      })
      .finally(() => {
        venueCartStartRef.current = null;
      });
    venueCartStartRef.current = attempt;
    return attempt;
  }, [venueHubId, venueCart, venueBoothToken]);

  // ─── Handle price sheet QR code auto-add-misc action ───────────────────────────────

  useEffect(() => {
    // S1179 hard-nav gate fix (2026-07-30): this effect used to be gated behind
    // `if (!router.isReady) return;` and read action/price only from router.query --
    // the same failure mode as the venue-mode effects above. Price-sheet QR codes are
    // scanned via a phone's camera app (not the in-app scanner), which opens this URL
    // via a genuine hard navigation, so this effect is exposed to the exact same bug:
    // router.isReady was confirmed live to never resolve true on a hard nav to this
    // route, which would silently block the misc-item add entirely. Read action/price
    // (and saleId, needed below for the query-clearing replace()) directly from
    // window.location.search first, same pattern as readVenueQueryParams above, with
    // router.query as a fallback for the non-browser case.
    let action: string | null = null;
    let priceStr: string | null = null;
    let saleIdFromUrl: string | null = null;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      action = params.get('action');
      priceStr = params.get('price');
      saleIdFromUrl = params.get('saleId');
    }
    if (!action) {
      const a = router.query.action;
      action = typeof a === 'string' && a ? a : null;
    }
    if (!priceStr) {
      const p = router.query.price;
      priceStr = typeof p === 'string' && p ? p : null;
    }
    if (!saleIdFromUrl) {
      const s = router.query.saleId;
      saleIdFromUrl = typeof s === 'string' && s ? s : null;
    }

    if (action === 'add-misc' && priceStr) {
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        // Add the misc item with the decoded price
        const label = price >= 1 ? `$${price.toFixed(0)}` : price === 0.25 ? '25¢' : '50¢';
        setCart(prev => [...prev, { id: `misc-${Date.now()}`, title: `Misc ${label}`, amount: price }]);

        // Clear the query params to prevent re-adding on page refresh
        router.replace({
          pathname: router.pathname,
          query: saleIdFromUrl ? { saleId: saleIdFromUrl } : {},
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
          const res = await api.post<{ secret: string }>('/stripe/terminal/connection-token', {
            ...(selectedSaleIdRef.current ? { saleId: selectedSaleIdRef.current } : {}),
          });
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

  // ─── Venue mode: hub-wide item search (S1178 follow-up, 2026-07-31) ───────────────
  // Same 300ms debounce as the selectedSaleId search above. venue mode never has a
  // selectedSaleId, so it hits searchHubCartItems instead of /items?saleId= -- that
  // endpoint searches every CONFIRMED booth's items on this hub by title OR sku and
  // reports back which booth each result belongs to.
  useEffect(() => {
    if (!venueHubId || !venueItemSearch.trim()) {
      setVenueSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await api.get<{ items: HubSearchItem[] }>(
          `/organizer/hubs/${venueHubId}/cart/items?q=${encodeURIComponent(venueItemSearch.trim())}`,
          venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
        );
        setVenueSearchResults(res.data.items ?? []);
      } catch {
        setVenueSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [venueItemSearch, venueHubId, venueBoothToken]);

  // ─── Sync inline cash numpad → cashReceived ────────────────────────────────────────────

  useEffect(() => {
    const cents = parseInt(cashNumpadValue || '0', 10);
    setCashReceived(cents / 100);
  }, [cashNumpadValue]);

  // ─── Refresh holds (manual or periodic) ────────────────────────────────────────────────

  const refreshHolds = useCallback(async () => {
    if (!selectedSaleId) return;
    try {
      const res = await api.get<{ holds: HoldItem[] }>(`/pos/holds?saleId=${selectedSaleId}`);
      setHolds(res.data.holds || []);
    } catch (err) {
      console.error('[pos] Failed to refresh holds:', err);
    }
  }, [selectedSaleId]);

  // ─── Search holds by shopper email ─────────────────────────────────────────────────────

  const handleShopperEmailSearch = useCallback(async (email: string) => {
    setShopperSearchEmail(email);
    if (!email.trim() || !selectedSaleId) {
      setShopperSearchResults([]);
      return;
    }

    setShopperSearchLoading(true);
    try {
      const res = await api.get<{ holds: HoldItem[] }>(
        `/pos/sessions/${selectedSaleId}/shopper-holds?email=${encodeURIComponent(email)}`
      );
      setShopperSearchResults(res.data.holds || []);
    } catch (err) {
      console.error('[pos] Shopper search failed:', err);
      setShopperSearchResults([]);
    } finally {
      setShopperSearchLoading(false);
    }
  }, [selectedSaleId]);

  // ─── Load holds when sale changes + set up auto-refresh ────────────────────────────────

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

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      refreshHolds();
    }, 30000);
    setHoldsRefreshInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedSaleId, refreshHolds]);

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
    setPaymentLinkUrl('');
    setPaymentLinkQr('');
    setPaymentLinkAmount(0);
    setPaymentLinkStatus('idle');
  };

  // ─── Linked carts polling ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedSaleId) return;

    const fetchLinkedCarts = async () => {
      try {
        const res = await api.get<{ sessions: LinkedCart[] }>(`/pos/sessions?saleId=${selectedSaleId}&_t=${Date.now()}`);
        setLinkedCarts(res.data.sessions || []);
      } catch (err) {
        console.error('[pos] Linked carts poll error:', err);
      }
    };

    // ADR-114 (2026-08-31): fire once immediately instead of waiting for the first 10s
    // tick -- an organizer landing here via "Add to POS cart" (holds.tsx navigates
    // straight to /organizer/pos?saleId=... the moment that response comes back) would
    // otherwise stare at an empty cart list for up to 10 seconds even though the session
    // already exists server-side.
    fetchLinkedCarts();
    const interval = setInterval(fetchLinkedCarts, 10000);

    setLinkedCartsPollInterval(interval);
    return () => clearInterval(interval);
  }, [selectedSaleId]);

  // ─── Play success chime (Web Audio API) ────────────────────────────────────────────

  const playSuccessChime = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1108, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // Audio not available: fail silently
    }
  }, []);

  // ─── Socket listener for payment status updates ────────────────────────────────────────

  useEffect(() => {
    // S1183 Fix 1: backend is the real gate now; whether the socket room a
    // TEAM_MEMBER joins is keyed correctly for real-time push is UNVERIFIED, but
    // polling is already a fallback every 5s regardless (see note above), so this
    // degrades gracefully even if the socket room key turns out wrong.
    if (!user) return;

    let isMounted = true;
    let socketInstance: any = null;

    // Match the fallback URL pattern used by useLiveFeed.ts and usePOSPaymentRequest.ts
    // NEXT_PUBLIC_API_URL is like https://backend.railway.app/api: strip /api suffix for socket base
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ||
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    // Dynamic import to avoid SSR issues
    import('socket.io-client').then(({ io }) => {
      if (!isMounted) return;

      // S708: accessToken is in an httpOnly cookie: withCredentials carries it on handshake
      socketInstance = io(socketUrl, {
        auth: token ? { token } : {},
        withCredentials: true,
        transports: ['websocket'],
        upgrade: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      const handlePaymentStatus = (event: any) => {
        if (!isMounted) return;

        const { requestId, status } = event;

        if (status === 'PAID') {
          // Use ref to get latest pending payments without stale closure
          const payment = pendingPaymentsRef.current.find(p => p.id === requestId);
          // Show banner regardless: fall back to event data if payment not yet in list
          setPaidBanner({
            shopperName: payment?.shopperName || 'Shopper',
            displayAmount: payment?.displayAmount || (event.totalAmountCents ? `$${(event.totalAmountCents / 100).toFixed(2)}` : ''),
          });
          if (soundEnabled) {
            playSuccessChime();
          }

          // Clear organizer cart since payment completed
          setCart([]);
          setBuyerEmail('');
          setLinkedShopperId(null);
          setLinkedShopperData(null);

          // Mark for visual feedback briefly, then remove
          setSuccessPaymentId(requestId);
          setTimeout(() => {
            setSuccessPaymentId(null);
            // Trigger refetch to update the list
            setPendingPayments(prev => prev.filter(p => p.id !== requestId));
          }, 3000);
        } else if (status === 'ACCEPTED') {
          // Update status in list for visual feedback
          setPendingPayments(prev =>
            prev.map(p => (p.id === requestId ? { ...p, status: 'ACCEPTED' } : p))
          );
        }
      };

      // Join sale room so organizer receives sale-scoped events (e.g., SCAN_AND_SPLIT)
      if (selectedSaleId) {
        socketInstance.emit('JOIN_SALE_FEED', selectedSaleId);
      }

      socketInstance.on('POS_PAYMENT_STATUS', handlePaymentStatus);

      // Feature #408: Scan & Split: listen for simultaneous QR scans on the same item
      socketInstance.on('SCAN_AND_SPLIT', (event: { itemId: string; scannerIds: string[]; scannedAt: number }) => {
        if (!isMounted) return;
        // Split Bill UI hidden per Patrick decision 2026-08-24 -- don't auto-open a panel
        // that's no longer rendered, and don't tell the cashier it opened when it didn't.
        if (!ENABLE_SPLIT_BILL) return;
        // Auto-open the split-bill panel with the scanned item in context
        setSplitBillOpen(true);
        setSplitCount(Math.max(2, event.scannerIds.length));
        setSplitCollected([]);
        setSplitCustomAmounts(Array(Math.max(2, event.scannerIds.length)).fill(''));
        showToast('Two shoppers scanned the same item. Split Bill opened', 'info');
      });
    }).catch((err) => {
      console.error('[pos] Failed to load socket.io-client:', err);
    });

    // Cleanup: properly disconnect socket when effect re-runs or component unmounts
    return () => {
      isMounted = false;
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [user, soundEnabled, playSuccessChime, selectedSaleId, showToast]);

  // ─── Today's total summary query (30s polling) ────────────────────────────────────────

  const { data: todaySummary } = useQuery({
    queryKey: ['pos-today-summary'],
    queryFn: async () => {
      const res = await api.get<{ totalAmountCents: number; transactionCount: number }>('/pos/transactions/today-summary');
      return res.data;
    },
    enabled: !!user, // S1183 Fix 1: backend (resolveOrganizerOrTeamMember) is the real gate now
    refetchInterval: 30000,
    staleTime: 0,
  });

  // ─── Cancel pending payment ──────────────────────────────────────────────────────────

  const handleCancelPayment = async (paymentId: string) => {
    setCancellingId(paymentId);
    // Mark as cancelled before the API call so the polling loop won't flash the paid banner
    cancelledRequestIdsRef.current.add(paymentId);
    try {
      await api.post(`/pos/payment-request/${paymentId}/cancel`, { reason: 'ORGANIZER_CANCEL' });
      // Refetch pending payments
      setPendingPayments(prev => prev.filter(p => p.id !== paymentId));
      showToast('Request cancelled', 'info');
    } catch (err) {
      console.error('[pos] Cancel payment error:', err);
      showToast('Failed to cancel request', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  // ─── Remove open cart ───────────────────────────────────────────────────────────────────

  const handleRemoveCart = async (sessionId: string) => {
    try {
      await api.delete(`/pos/sessions/${sessionId}`);
      setLinkedCarts(prev => prev.filter(c => c.id !== sessionId));
      showToast('Cart removed', 'info');
    } catch (err) {
      console.error('[pos] Remove cart error:', err);
      showToast('Failed to remove cart', 'error');
    }
  };

  // ─── Cart operations ────────────────────────────────────────────────────────────────────

  const addToCart = (item: Item | { title: string; amount: number }) => {
    clientTransactionIdRef.current = null;
    if (venueHubId && 'price' in item) {
      addVenueItemToCart(item);
      return;
    }
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

  // ─── Venue mode: add item via booth-cart endpoint (resolves vendor booth server-side,
  // reserves the item against this cart) -- S1178 ──────────────────────────────────────
  // Returns a promise resolving true only when the item genuinely landed in the
  // server-side booth cart -- 2026-07-30 fix (live bug, Pegasus/S1178): callers used
  // to fire a "success" toast unconditionally right after calling this, even though
  // this function silently no-ops when venueCart hasn't finished starting yet (a real
  // race on a fresh page load, camera opened before POST /cart/start resolves) or when
  // the server rejects the item. That produced a false "Item added to cart" toast
  // immediately followed by an empty cart on close -- exactly Pegasus's report.
  //
  // Cart-on-load UX trap fix (2026-09-06): this is the SOLE cart-mutating entry point in
  // venue mode, so it's the natural place to lazily ensure a cart exists instead of
  // assuming the (now-removed) mount-time auto-start effect already created one. Calls
  // ensureVenueCart() first -- a no-op if venueCart is already set, otherwise it starts
  // (or reuses) one. Bug B's still-starting-vs-permanently-failed distinction
  // (venueStartFailure) is preserved unchanged, just sourced from ensureVenueCart's
  // return value instead of the venueStartFailure state directly, since a state read
  // immediately after ensureVenueCart's own setVenueStartFailure call inside the same
  // tick would still see the PRE-update value (React state closures don't update
  // mid-callback) -- ensureVenueCart hands back the freshly-computed message instead.
  const addVenueItemToCart = useCallback((item: Item): Promise<{ added: boolean; message?: string }> => {
    if (cart.some(c => c.itemId === item.id)) {
      const message = `"${item.title}" is already in the cart.`;
      setErrorMessage(message);
      return Promise.resolve({ added: false, message });
    }
    return ensureVenueCart().then(({ cart: activeCart, failureMessage }) => {
      if (!activeCart) {
        // Bug B fix (POS Venue Mode QA, 2026-09-05), preserved: activeCart is null in TWO
        // very different situations -- a genuine transient race (the cart/start call is
        // still in flight; retrying in a moment fixes it), and a PERMANENT failure (most
        // commonly the market is closed -- startBoothCart returns 403 "This market has
        // been closed and can no longer accept payments.", see
        // vendorBoothCartController.ts) where retrying will never help. failureMessage is
        // only ever set once the cart/start call has actually come back with an error, so
        // its presence is exactly the signal that distinguishes "still starting" from
        // "will not start until reopened" -- same distinction hubs/[hubId]/cart.tsx's
        // describeFailure makes for the old register page (canRetry: false + the server's
        // own wording for a 403).
        const message = failureMessage || 'Register is still starting -- wait a moment and try again.';
        setErrorMessage(message);
        return { added: false, message };
      }
      return api.post(
        `/organizer/hubs/${venueHubId}/cart/${activeCart.id}/items`,
        { itemIds: [item.id] },
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      )
        .then(res => {
          const accepted = res.data?.accepted || [];
          const rejected = res.data?.rejected || [];
          let added = false;
          let message: string | undefined;
          if (accepted.length > 0) {
            const a = accepted[0];
            const cartId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            setCart(prev => [...prev, { id: cartId, itemId: a.itemId, title: a.title, amount: a.price ?? 0, photoUrl: item.photoUrls?.[0] }]);
            setErrorMessage('');
            added = true;
          }
          if (rejected.length > 0) {
            message = `"${item.title}" could not be added: ${rejected[0].reason}`;
            setErrorMessage(message);
          }
          return { added, message };
        })
        .catch(err => {
          console.error('[pos] Venue add-item error:', err);
          const message = err?.response?.data?.error || err?.response?.data?.message || `Failed to add "${item.title}".`;
          setErrorMessage(message);
          return { added: false, message };
        });
    });
  }, [venueHubId, ensureVenueCart, cart, venueBoothToken]);

  // ─── Venue mode: sequential per-booth checkout -- ports the proven flow from
  // hubs/[hubId]/cart.tsx (now deprecated, see S1178 ADR). Card/manual-card rail only in
  // this pass; cash/venmo/zelle/QR-payment-link venue support is a flagged follow-up --
  // no per-vendor fee-attribution path exists yet for those rails (BoothCartLeg.rail is
  // 'TERMINAL' | 'QR' only). ────────────────────────────────────────────────────────────
  const connectReaderForVenueBooth = useCallback(async (vendorBoothId: string) => {
    const { loadStripeTerminal } = await import('@stripe/terminal-js');
    const StripeTerminal = await loadStripeTerminal();

    if (venueTerminalRef.current) {
      try { await venueTerminalRef.current.disconnectReader(); } catch {}
      venueTerminalRef.current = null;
    }

    const terminal = StripeTerminal!.create({
      onFetchConnectionToken: async () => {
        const res = await api.post<{ secret: string }>(
          `/organizer/hubs/${venueHubId}/cart/${venueCart!.id}/terminal/connection-token`,
          { vendorBoothId },
          venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
        );
        return res.data.secret;
      },
      onUnexpectedReaderDisconnect: () => {
        setVenueCheckoutFailure('The card reader disconnected. No card was charged.');
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

    venueTerminalRef.current = terminal;
    return terminal;
  }, [venueHubId, venueCart, venueBoothToken]);

  const runVenueBoothLeg = useCallback(async (booth: { vendorBoothId: string; vendorName: string; subtotalCents: number }) => {
    setVenueBoothOutcomes(prev => ({ ...prev, [booth.vendorBoothId]: 'connecting' }));
    try {
      const terminal = await connectReaderForVenueBooth(booth.vendorBoothId);
      const authRes = await api.post(
        `/organizer/hubs/${venueHubId}/cart/${venueCart!.id}/terminal/authorize`,
        { vendorBoothId: booth.vendorBoothId },
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      );
      const { clientSecret } = authRes.data;

      setVenueBoothOutcomes(prev => ({ ...prev, [booth.vendorBoothId]: 'ready' }));
      showToast(`Tap card for ${booth.vendorName}, $${(booth.subtotalCents / 100).toFixed(2)}`, 'success');

      setVenueBoothOutcomes(prev => ({ ...prev, [booth.vendorBoothId]: 'tapping' }));
      const collectResult = await terminal.collectPaymentMethod(clientSecret);
      if ('error' in collectResult) throw new Error(collectResult.error.message);
      const processResult = await terminal.processPayment(collectResult.paymentIntent);
      if ('error' in processResult) throw new Error(processResult.error.message);

      setVenueBoothOutcomes(prev => ({ ...prev, [booth.vendorBoothId]: 'authorized' }));
      return true;
    } catch (err: any) {
      console.error(`[pos] Venue booth leg failed for ${booth.vendorBoothId}:`, err);
      setVenueBoothOutcomes(prev => ({ ...prev, [booth.vendorBoothId]: 'failed' }));
      setVenueCheckoutFailure(
        `${err?.response?.data?.error || err?.response?.data?.message || err?.message || 'The card was not accepted.'} No card was charged. This cart is closing.`
      );
      return false;
    }
  }, [connectReaderForVenueBooth, venueHubId, venueCart, showToast, venueBoothToken]);

  const cancelVenueCart = useCallback(async () => {
    if (!venueCart) return;
    try {
      await api.post(
        `/organizer/hubs/${venueHubId}/cart/${venueCart.id}/cancel`,
        {},
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      );
    } catch (err) {
      console.error('[pos] Venue cart cancel failed:', err);
    }
  }, [venueHubId, venueCart, venueBoothToken]);

  // ─── Venue mode: explicit "Cancel this cart" (Bug F, POS Venue Mode QA, 2026-09-05) ──
  // startBoothCart find-or-reuses an existing PENDING cart for this cashier identity
  // (see vendorBoothCartController.ts), which is correct for a page refresh mid-sale but
  // leaves no way to actually ABANDON that cart outside of a live checkout attempt --
  // stranding a cashier whose browser died mid-sale, or leaving a stray empty cart that
  // blocks hub closure (deleteHub's openCartCount blocker). The /cancel endpoint this
  // calls already exists (cancelBoothCart, wired to POST
  // /api/organizer/hubs/:hubId/cart/:cartTransactionId/cancel) and is already used
  // internally above (cancelVenueCart) -- but only as a silent best-effort cleanup after
  // a failed checkout leg. This is a deliberate, user-initiated action instead, so unlike
  // cancelVenueCart it does NOT swallow a failure (e.g. the cart is already CAPTURING) --
  // it tells the cashier honestly whether the cancel actually happened.
  const handleCancelVenueCart = useCallback(() => {
    if (!venueCart) return;
    const cartId = venueCart.id;
    setConfirmState({
      open: true,
      title: 'Cancel this cart',
      message: 'This releases every item in this cart back to available. Nothing is charged. Use this to clear a stray or abandoned cart -- for example after a previous cashier session was left open.',
      onConfirm: async () => {
        try {
          await api.post(
            `/organizer/hubs/${venueHubId}/cart/${cartId}/cancel`,
            {},
            venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
          );
          clearCart();
          setVenueCheckoutOpen(false);
          setVenueBooths([]);
          setVenueBoothOutcomes({});
          setVenueCart(null);
          // Cart-on-load UX trap fix (2026-09-06): no more eager auto-start effect to
          // reset a guard ref for -- leaving venueCart null here is now the entire fix.
          // Nothing re-opens a cart until the cashier adds the next item (see
          // ensureVenueCart above), so this is a genuine resting state, not "about to
          // restart automatically."
          showToast('Cart cancelled. No cart is open until the next item is added.', 'info');
        } catch (err: any) {
          console.error('[pos] Cancel venue cart error:', err);
          showToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to cancel the cart.', 'error');
        } finally {
          setConfirmState(s => ({ ...s, open: false }));
        }
      },
    });
  }, [venueHubId, venueCart, venueBoothToken, showToast]);

  const captureVenueAll = useCallback(async () => {
    if (!venueCart) return;
    setVenueCapturing(true);
    setVenueCheckoutFailure(null);
    try {
      await api.post(
        `/organizer/hubs/${venueHubId}/cart/${venueCart.id}/capture`,
        {},
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      );
      setVenueCaptureFailed(false);
      setSuccessMessage(`✅ Venue sale of $${cartTotal.toFixed(2)} accepted across ${venueBooths.length} vendor${venueBooths.length === 1 ? '' : 's'}.`);
      setPaymentStatus('success');
      clearCart();
      setVenueCheckoutOpen(false);
      setVenueCart(null);
      // Cart-on-load UX trap fix (2026-09-06): no auto-start effect left to reset a guard
      // ref for -- the next sale's cart is created lazily on the next add-item call.
    } catch (err: any) {
      console.error('[pos] Venue capture failed:', err);
      setVenueCaptureFailed(true);
      setVenueCheckoutFailure(
        `${err?.response?.data?.error || err?.response?.data?.message || 'The sale did not finish.'} The card was approved but the sale is not closed yet. Do not charge the customer again.`
      );
    } finally {
      setVenueCapturing(false);
    }
  }, [venueHubId, venueCart, cartTotal, venueBooths.length, venueBoothToken]);

  const startVenueCheckout = useCallback(async () => {
    if (!venueCart || !cart.length) return;
    setPaymentStatus('creating');
    setErrorMessage('');
    setVenueCheckoutFailure(null);
    setVenueCaptureFailed(false);
    try {
      const summaryRes = await api.get(
        `/organizer/hubs/${venueHubId}/cart/${venueCart.id}/summary`,
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      );
      const boothList = summaryRes.data.booths || [];
      if (boothList.length === 0) {
        setPaymentStatus('error');
        setErrorMessage('The venue cart is empty.');
        return;
      }
      const notReady = boothList.find((b: any) => !b.readyForStandardCharge);
      if (notReady) {
        setPaymentStatus('error');
        setErrorMessage(`${notReady.vendorName} has not finished payout setup. Remove their items or ask them to finish setup.`);
        return;
      }
      setVenueBooths(boothList);
      setVenueBoothOutcomes(Object.fromEntries(boothList.map((b: any) => [b.vendorBoothId, 'pending' as const])));
      setVenueCheckoutOpen(true);
      setPaymentStatus('waiting_for_card');

      for (let i = 0; i < boothList.length; i++) {
        const ok = await runVenueBoothLeg(boothList[i]);
        if (!ok) {
          await cancelVenueCart();
          setPaymentStatus('error');
          return;
        }
      }

      setPaymentStatus('processing');
      await captureVenueAll();
    } catch (err: any) {
      console.error('[pos] Venue checkout failed to start:', err);
      setPaymentStatus('error');
      setErrorMessage(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to start venue checkout.');
    }
  }, [venueHubId, venueCart, cart.length, runVenueBoothLeg, cancelVenueCart, captureVenueAll, venueBoothToken]);

  // ─── Venue mode: cash checkout (S1178 follow-up, 2026-07-31) ──────────────────────────
  // Deliberately a SEPARATE function from startVenueCheckout, not a branch inside it --
  // startVenueCheckout's first step is GET .../cart/summary, which 400s the whole checkout
  // on any booth that isn't readyForStandardCharge (Stripe onboarding incomplete). That
  // pre-check exists for the card/Terminal rail, where the booth's OWN connected account
  // is about to be charged directly -- it must never gate a cash sale, where no booth's
  // Stripe account is touched at all. This calls the cash/capture endpoint directly: no
  // summary pre-check, no per-booth tap loop, nothing to poll.
  const handleVenueCashPayment = useCallback(async () => {
    if (!venueCart || !cart.length) return;
    setPaymentStatus('creating');
    setErrorMessage('');
    setVenueCheckoutFailure(null);
    setVenueCaptureFailed(false);
    try {
      const cashReceivedCents = Math.round(cashReceived * 100);
      const res = await api.post<{ changeCents: number }>(
        `/organizer/hubs/${venueHubId}/cart/${venueCart.id}/cash/capture`,
        { cashReceivedCents },
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      );
      const changeCents = res.data?.changeCents ?? 0;
      setPaymentStatus('success');
      setSuccessMessage(`✅ Cash sale of $${cartTotal.toFixed(2)} recorded. Change: $${(changeCents / 100).toFixed(2)}.`);
      clearCart();
      setVenueCart(null);
      // Cart-on-load UX trap fix (2026-09-06): no auto-start effect left to reset a guard
      // ref for -- the next sale's cart is created lazily on the next add-item call.
    } catch (err: any) {
      console.error('[pos] Venue cash payment failed:', err);
      setPaymentStatus('error');
      setErrorMessage(err?.response?.data?.error || err?.response?.data?.message || 'Cash sale failed. Please try again.');
    }
  }, [venueHubId, venueCart, cart.length, cashReceived, cartTotal, venueBoothToken]);

  // ─── Venue mode: Stripe QR checkout (S1178 follow-up, Task 3, 2026-07-31) ─────────────
  // Patrick: "the same as what's already there for QR ... they're both already built,
  // just reuse them." The register side of this reuses createBoothCartQrSetupIntent
  // (already built for exactly this multi-vendor-split purpose) + the SAME
  // generate/display/poll shape the non-venue paymentLink* flow above already uses.
  // The shopper's own phone loads pages/pay/[setupIntentClientSecretToken].tsx, which
  // reuses PosManualCard's Stripe Elements card form (in its new setup-intent mode) to
  // call stripe.confirmCardSetup -- this register side never touches the card itself.
  const handleVenueGenerateQr = useCallback(async () => {
    if (!venueCart || !cart.length) return;
    setVenueQrStatus('generating');
    setErrorMessage('');
    setVenueCheckoutFailure(null);
    try {
      const res = await api.post<{ clientSecret: string; setupIntentId: string }>(
        `/organizer/hubs/${venueHubId}/cart/${venueCart.id}/qr/setup-intent`,
        {},
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      );
      const { clientSecret, setupIntentId } = res.data;
      setVenueQrClientSecret(clientSecret);
      setVenueQrSetupIntentId(setupIntentId);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setVenueQrUrl(`${origin}/pay/${encodeURIComponent(clientSecret)}?amount=${cartTotal.toFixed(2)}`);
      setVenueQrStatus('waiting');
    } catch (err: any) {
      console.error('[pos] Venue QR setup-intent failed:', err);
      setVenueQrStatus('idle');
      setErrorMessage(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to start QR checkout.');
    }
  }, [venueHubId, venueCart, cart.length, cartTotal, venueBoothToken]);

  const handleVenueQrReset = useCallback(() => {
    setVenueQrStatus('idle');
    setVenueQrClientSecret('');
    setVenueQrSetupIntentId('');
    setVenueQrUrl('');
  }, []);

  // Once the shopper's phone confirms the SetupIntent (detected by the poll below),
  // clone the resulting PaymentMethod into every represented booth's account
  // (authorizeBoothCartQrLegs) and capture through the SAME shared /capture endpoint
  // the Terminal rail uses -- cash is the only rail that skips this authorize/capture
  // split (Task 2). Whole-cart-fail on any error, same policy as startVenueCheckout.
  const finishVenueQrCheckout = useCallback(async () => {
    if (!venueCart) return;
    setVenueCapturing(true);
    setVenueCheckoutFailure(null);
    try {
      await api.post(
        `/organizer/hubs/${venueHubId}/cart/${venueCart.id}/qr/authorize`,
        { setupIntentId: venueQrSetupIntentId },
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      );
      await api.post(
        `/organizer/hubs/${venueHubId}/cart/${venueCart.id}/capture`,
        {},
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      );
      setSuccessMessage(`✅ Venue sale of $${cartTotal.toFixed(2)} accepted via QR.`);
      setPaymentStatus('success');
      clearCart();
      setVenueCart(null);
      // Cart-on-load UX trap fix (2026-09-06): no auto-start effect left to reset a guard
      // ref for -- the next sale's cart is created lazily on the next add-item call.
    } catch (err: any) {
      console.error('[pos] Venue QR finish failed:', err);
      await cancelVenueCart();
      setPaymentStatus('error');
      setVenueCheckoutFailure(
        `${err?.response?.data?.error || err?.response?.data?.message || err?.message || 'The QR payment could not be finished.'} This cart is closing.`
      );
    } finally {
      setVenueCapturing(false);
      handleVenueQrReset();
    }
  }, [venueHubId, venueCart, venueQrSetupIntentId, cartTotal, cancelVenueCart, venueBoothToken, handleVenueQrReset]);

  // Poll Stripe directly for the SetupIntent's status -- same 3s interval the
  // non-venue paymentLink* QR flow already uses (see "Payment link polling" below).
  // No new backend status endpoint needed: the clientSecret already lets the browser
  // ask Stripe itself, same as any other Stripe.js client-side confirmation flow.
  useEffect(() => {
    if (venueQrStatus !== 'waiting' || !venueQrClientSecret) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const stripe = await getStripePromise();
        if (!stripe || cancelled) return;
        const { setupIntent } = await stripe.retrieveSetupIntent(venueQrClientSecret);
        if (cancelled) return;
        if (setupIntent?.status === 'succeeded') {
          clearInterval(interval);
          setVenueQrStatus('confirmed');
        }
      } catch (err) {
        console.error('[pos] Venue QR poll error:', err);
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [venueQrStatus, venueQrClientSecret]);

  // Fire the authorize+capture sequence exactly once, the instant the poll above
  // detects the shopper finished on their phone.
  useEffect(() => {
    if (venueQrStatus !== 'confirmed') return;
    finishVenueQrCheckout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueQrStatus]);

  const quickAddMisc = (amount: number) => {
    const label = amount < 1
      ? `${Math.round(amount * 100)}¢`
      : Number.isInteger(amount)
        ? `$${amount.toFixed(0)}`
        : `$${amount.toFixed(2)}`;
    addToCart({ title: `Misc ${label}`, amount });
  };

  const removeFromCart = (cartId: string) => {
    clientTransactionIdRef.current = null;
    const removedItem = cart.find(c => c.id === cartId);
    setCart(prev => prev.filter(c => c.id !== cartId));

    if (venueHubId && venueCart && removedItem?.itemId) {
      api.delete(
        `/organizer/hubs/${venueHubId}/cart/${venueCart.id}/items/${removedItem.itemId}`,
        venueBoothToken ? { headers: { 'X-Booth-Token': venueBoothToken } } : undefined
      ).catch(err => {
        // Server-side release failed (e.g. checkout already started, or a race).
        // Put the item back in the visible cart so local state doesn't silently
        // diverge from server truth (item invisible in UI but still reserved
        // server-side, blocking search -- the exact bug this fix closes).
        setCart(prev => [...prev, removedItem]);
        setErrorMessage(err?.response?.data?.error || 'Could not remove item -- please try again.');
      });
    }
  };

  const clearCart = () => {
    clientTransactionIdRef.current = null;
    setCart([]);
    setNumpadValue('');
    setCashReceived(0);
    setCashNumpadValue('');
    setBuyerEmail('');
    setItemSearch('');
    setSearchResults([]);
    setIsTestTransaction(false);
  };

  // cartTotal declaration moved up to right after `cart` state (see comment there) -- S1178 BQ fix.
  const cartChange = Math.max(0, cashReceived - cartTotal);
  // Amount to charge on card: cartTotal minus cash if a partial cash payment is entered
  const cardAmount = cashReceived > 0 && cashReceived < cartTotal ? cartTotal - cashReceived : cartTotal;

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
    if (venueHubId) {
      await startVenueCheckout();
      return;
    }
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

      // Idempotency guard (double-tap / retry): reuse the same token across retries of this
      // exact cart; a fresh token is only issued once the cart actually changes or a prior
      // attempt is explicitly cancelled (see the ref's declaration comment above).
      if (!clientTransactionIdRef.current) {
        clientTransactionIdRef.current = generateClientTransactionId();
      }
      const clientTransactionId = clientTransactionIdRef.current;

      // Calculate split payment amounts
      const totalAmountCents = Math.round(cartTotal * 100);
      const cashReceivedCents = Math.round(cashReceived * 100);
      const remainingCents = cashReceivedCents > 0 && cashReceivedCents < totalAmountCents
        ? totalAmountCents - cashReceivedCents
        : 0;

      const piRes = await api.post<{
        paymentIntentId: string;
        clientSecret: string;
        purchaseIds: string[];
        totalAmount: number;
        platformFee: number;
      }>('/stripe/terminal/payment-intent', {
        items, // raw, undiscounted per-item amounts -- backend applies the discount itself
        saleId: selectedSaleId,
        clientTransactionId,
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
        ...(remainingCents > 0 ? { cashAmountCents: cashReceivedCents } : {}),
        // POS Cashier Discount Permission (2026-08-28)
        ...(discountAmount > 0 ? {
          discountType,
          discountValue: discountValueToSubmit,
          ...(discountReasonNote.trim() ? { discountReasonNote: discountReasonNote.trim() } : {}),
        } : {}),
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
      const chargeAmount = remainingCents > 0 ? (remainingCents / 100).toFixed(2) : cartTotal.toFixed(2);
      setSuccessMessage(
        `✅ Card payment of $${chargeAmount} accepted${buyerEmail.trim() ? `. Receipt sent to ${buyerEmail.trim()}` : ''}.`
      );

      showSurvey('OG-3');
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

    const items = cart.map(c => ({
      ...(c.itemId ? { itemId: c.itemId } : {}),
      amount: c.amount,
      label: c.title,
    }));

    // #561 offline POS transaction queuing: queue the cash sale instead of hard-failing
    // when there's no connectivity. Card (Stripe Terminal) swipes stay online-only:
    // this only applies to the cash flow, which needs no live processor.
    const queueOffline = async () => {
      const { recordOfflineCashCheckout } = await import('../../lib/offlineSync');
      await recordOfflineCashCheckout(selectedSaleId, {
        items,
        cashReceived,
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
        // POS Cashier Discount Permission fix (2026-08-28): see the matching note on the
        // live-path POST above -- keeps the offline-queued payload consistent with it so a
        // discount applied while offline isn't silently dropped once synced.
        ...(discountAmount > 0 ? {
          discountType,
          discountValue: discountValueToSubmit,
          ...(discountReasonNote.trim() ? { discountReasonNote: discountReasonNote.trim() } : {}),
        } : {}),
        // Test Transaction safety net UI (2026-08-29): kept consistent with the live-path
        // POST below so a test transaction started offline isn't silently promoted to a
        // real one once synced.
        ...(isTestTransaction ? { isTestTransaction: true } : {}),
      });
      setPaymentStatus('success');
      setSuccessMessage(
        `📥 Offline. Cash sale for $${cartTotal.toFixed(2)} queued. It will sync automatically once you're back online.`
      );
      showSurvey('OG-3');
      clearCart();
    };

    // Already known offline: skip the network round-trip entirely and queue immediately.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        await queueOffline();
      } catch (queueErr) {
        console.error('[pos] Failed to queue offline cash sale:', queueErr);
        setPaymentStatus('error');
        setErrorMessage('Unable to queue cash sale offline. Please try again.');
      }
      return;
    }

    try {
      const response = await api.post<CashPaymentResponse>('/stripe/terminal/cash-payment', {
        items, // raw, undiscounted per-item amounts -- backend applies the discount itself
        cashReceived,
        saleId: selectedSaleId,
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
        // POS Cashier Discount Permission fix (2026-08-28, findasale-hacker P0): previously
        // omitted here -- the cash-payment endpoint silently never applied any discount to
        // the persisted sale even though this same UI computed and displayed a discounted
        // total. Mirrors the pattern already used for the card/terminal payment-intent POST
        // above (search discountAmount > 0 in this file).
        ...(discountAmount > 0 ? {
          discountType,
          discountValue: discountValueToSubmit,
          ...(discountReasonNote.trim() ? { discountReasonNote: discountReasonNote.trim() } : {}),
        } : {}),
        // Test Transaction safety net UI (2026-08-29)
        ...(isTestTransaction ? { isTestTransaction: true } : {}),
      });

      setLastCashFee(response.data);
      setPaymentStatus('success');
      const change = (cashReceived - cartTotal).toFixed(2);
      setSuccessMessage(
        `✅ Cash sale recorded for $${cartTotal.toFixed(2)}. Change: $${change}${buyerEmail.trim() ? `. Receipt sent to ${buyerEmail.trim()}` : ''}.`
      );

      showSurvey('OG-3');
      clearCart();
    } catch (err: any) {
      // No response reached the server → connectivity failure, queue for offline retry.
      // A server-returned error (4xx/5xx) means the request WAS received and rejected:
      // that's a real failure (e.g. item already sold), not a connectivity issue, so it
      // must still surface to the organizer rather than silently queue.
      if (!err?.response) {
        try {
          await queueOffline();
          return;
        } catch (queueErr) {
          console.error('[pos] Failed to queue offline cash sale:', queueErr);
        }
      }
      console.error('[pos] Cash payment error:', err);
      setPaymentStatus('error');
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Cash sale failed. Please try again.';
      setErrorMessage(message);
    }
  };

  // Venmo / Zelle: organizer collects full amount peer-to-peer outside app.
  // Platform fee is captured via Stripe deduction from organizer's payout.
  const handlePeerToPeerPayment = async (method: 'venmo' | 'zelle') => {
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
        items, // raw, undiscounted per-item amounts -- backend applies the discount itself
        cashReceived: cartTotal, // organizer collects the full amount
        saleId: selectedSaleId,
        paymentMethod: method, // flag for backend reporting
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
        // POS Cashier Discount Permission fix (2026-08-28): Venmo/Zelle route through this
        // same cash-payment endpoint and had the identical gap as the Cash button.
        ...(discountAmount > 0 ? {
          discountType,
          discountValue: discountValueToSubmit,
          ...(discountReasonNote.trim() ? { discountReasonNote: discountReasonNote.trim() } : {}),
        } : {}),
        // Test Transaction safety net UI (2026-08-29)
        ...(isTestTransaction ? { isTestTransaction: true } : {}),
      });

      setLastCashFee(response.data);
      setPaymentStatus('success');
      const methodLabel = method === 'venmo' ? 'Venmo' : 'Zelle';
      setSuccessMessage(
        `✅ ${methodLabel} sale recorded for $${cartTotal.toFixed(2)}. Platform fee will be deducted from your next payout.`
      );

      showSurvey('OG-3');
      clearCart();
    } catch (err: any) {
      console.error(`[pos] ${method} payment error:`, err);
      setPaymentStatus('error');
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Payment recording failed. Please try again.';
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
      // A cancelled PaymentIntent can never be reused -- force a fresh clientTransactionId
      // (and Stripe idempotency key) if the organizer retries this cart.
      clientTransactionIdRef.current = null;
    }

    setPaymentStatus('idle');
  };

  const handleNewTransaction = () => {
    setPaymentStatus('idle');
    setErrorMessage('');
    setSuccessMessage('');
    setLastCashFee(null);
    setCashNumpadValue('');
    clearCart();
    // Reset split-bill state (#406)
    setSplitBillOpen(false);
    setSplitCount(2);
    setSplitCollected([]);
    setSplitCustomAmounts([]);
    setSplitMode('even');
  };

  // ─── QR Code Scanning ─────────────────────────────────────────────────────────────────────

  const startQRScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      videoRef.current.srcObject = stream;
      setQrScanStatus('scanning');
      setQrScanMessage('');
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

  // Tap-to-scan: crop around the tap point so only the tapped QR is scanned
  const scanOnTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;

    // Map tap position from display coords → video pixel coords
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;
    const tapX = (e.clientX - rect.left) * scaleX;
    const tapY = (e.clientY - rect.top) * scaleY;

    // Crop a 35%-wide square around the tap: large enough to capture the QR,
    // small enough to exclude neighbouring QR codes on the sheet
    const cropSize = video.videoWidth * 0.35;
    const cropX = Math.max(0, tapX - cropSize / 2);
    const cropY = Math.max(0, tapY - cropSize / 2);
    const cropW = Math.min(cropSize, video.videoWidth - cropX);
    const cropH = Math.min(cropSize, video.videoHeight - cropY);

    setQrScanStatus('found');
    setQrScanMessage('Looking…');

    const processCode = (qrText: string) => {
      // Shopper account QR code
      const userQRMatch = qrText.match(/findasale:\/\/user\/([a-z0-9]+)/i);
      if (userQRMatch) {
        const userId = userQRMatch[1];
        setQrScanMessage('Loading shopper account…');
        api
          .get<any>(`/users/qr/${userId}`)
          .then(res => {
            setLinkedShopperData(res.data);
            setLinkedShopperId(res.data.id || null);
            if (res.data.email) setBuyerEmail(res.data.email);
            // 2026-08-26 fix (Patrick): "make it so the qr auto loads holds and we
            // don't need the button at all" -- reuses handleLoadHold, the SAME proven
            // function behind the "Pull" button and the Holds panel, rather than
            // re-deriving cart-loading logic here. handleLoadHold already merges every
            // OTHER hold for this shopper (via the `holds` state array) and pulls any
            // shared cart, so calling it once with the first hold is enough -- looping
            // over every hold and calling it per-hold would double-add items.
            const firstHold = res.data.holds?.[0];
            if (firstHold) {
              handleLoadHold({
                reservationId: firstHold.id,
                itemId: firstHold.itemId,
                itemTitle: firstHold.itemTitle,
                itemPrice: firstHold.price,
                shopperId: res.data.id,
                shopperName: res.data.name,
                shopperEmail: res.data.email,
                expiresAt: firstHold.expiresAt,
              });
              setQrScanStatus('found');
              setQrScanMessage('');
            } else {
              setQrScanStatus('scanning');
              setQrScanMessage('');
            }
          })
          .catch(err => {
            setQrScanStatus('error');
            setQrScanMessage('Shopper not found or has no active holds');
            console.error('[pos] QR shopper fetch error:', err);
            setTimeout(() => { setQrScanStatus('scanning'); setQrScanMessage(''); }, 2000);
          });
        return;
      }

      // Item sticker QR
      const match = qrText.match(/items\/([a-z0-9]+)$/i);
      if (match) {
        const itemId = match[1];
        setQrScanMessage('Item found! Adding to cart…');
        api
          .get<Item>(`/items/${itemId}`)
          .then(res => {
            const scannedItem = res.data;
            if (scannedItem.draftStatus && scannedItem.draftStatus !== 'PUBLISHED') {
              setQrScanStatus('error');
              setQrScanMessage('This item is pending review and cannot be sold yet');
              setTimeout(() => { setQrScanStatus('scanning'); setQrScanMessage(''); }, 3000);
              return;
            }
            if (scannedItem.status !== 'AVAILABLE') {
              setQrScanStatus('error');
              setQrScanMessage('This item is not available for sale');
              setTimeout(() => { setQrScanStatus('scanning'); setQrScanMessage(''); }, 3000);
              return;
            }
            // S1178 gap fix (2026-07-30): the camera modal is shared between normal
            // POS mode (search block, gated on selectedSaleId) and venue mode (gated on
            // venueHubId) -- this single scan-result handler must route to the correct
            // cart depending on which mode is active, same reasoning as the item-ID
            // input fix above.
            if (venueHubId) {
              addVenueItemToCart(scannedItem).then(({ added, message }) => {
                if (added) {
                  showToast('✓ Item added to cart', 'success');
                  setQrScanStatus('scanning');
                  setQrScanMessage('');
                } else {
                  setQrScanStatus('error');
                  // Render the real failure reason inside the camera modal itself --
                  // the fullscreen modal (fixed inset-0 z-50) covers the page's
                  // errorMessage banner, so a "see message below" pointer was never
                  // visible to the cashier (2026-07-30 fix, Pegasus/S1178 follow-up).
                  setQrScanMessage(message || 'Could not add item to cart');
                  setTimeout(() => { setQrScanStatus('scanning'); setQrScanMessage(''); }, 3500);
                }
              });
              return;
            }
            addToCart(scannedItem);
            showToast('✓ Item added to cart', 'success');
            setQrScanStatus('scanning');
            setQrScanMessage('');
          })
          .catch(err => {
            setQrScanStatus('error');
            setQrScanMessage('Item not found or already in cart');
            console.error('[pos] QR item fetch error:', err);
            setTimeout(() => { setQrScanStatus('scanning'); setQrScanMessage(''); }, 2000);
          });
        return;
      }

      // Price sheet misc-add QR
      const hasMiscAction = qrText.includes('action=add-misc');
      const priceMatch = qrText.match(/[?&]price=([0-9.]+)/);
      if (hasMiscAction && priceMatch) {
        const price = parseFloat(priceMatch[1]);
        if (!isNaN(price) && price > 0) {
          quickAddMisc(price);
          showToast(`✓ $${price.toFixed(2)} misc added to cart`, 'success');
          setQrScanStatus('scanning');
          setQrScanMessage('');
          return;
        }
      }

      setQrScanStatus('error');
      setQrScanMessage('Invalid QR code format');
      setTimeout(() => { setQrScanStatus('scanning'); setQrScanMessage(''); }, 2000);
    };

    let attempts = 0;
    const maxAttempts = 10;

    const tryFrame = () => {
      const context = canvas.getContext('2d');
      if (!context) return;
      // Draw only the cropped region so jsQR sees just what the user tapped
      canvas.width = cropW;
      canvas.height = cropH;
      context.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      // @ts-ignore
      const code = jsQR(imageData.data, canvas.width, canvas.height);
      if (code) {
        processCode(code.data);
        return;
      }
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryFrame, 100);
      } else {
        setQrScanStatus('error');
        setQrScanMessage('No QR code detected. Try again');
        setTimeout(() => { setQrScanStatus('scanning'); setQrScanMessage(''); }, 1500);
      }
    };

    tryFrame();
  }, [addToCart, quickAddMisc, venueHubId, addVenueItemToCart]);

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

      // Calculate remaining balance: if cashReceived < cartTotal, QR encodes only the card amount
      const totalAmountCents = Math.round(cartTotal * 100);
      const cashReceivedCents = Math.round(cashReceived * 100);
      const remainingCents = cashReceivedCents > 0 && cashReceivedCents < totalAmountCents
        ? totalAmountCents - cashReceivedCents
        : 0;

      const amountForQr = remainingCents > 0 ? remainingCents / 100 : cartTotal;

      const res = await api.post<{ linkId: string; paymentLinkUrl: string; qrCodeDataUrl: string }>('/pos/payment-links', {
        saleId: selectedSaleId,
        amount: amountForQr,
        itemIds,
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
      });
      setPaymentLinkId(res.data.linkId);
      setPaymentLinkUrl(res.data.paymentLinkUrl);
      setPaymentLinkQr(res.data.qrCodeDataUrl); // base64 data URL
      setPaymentLinkAmount(amountForQr);
      setPaymentLinkStatus('waiting');
    } catch (err: any) {
      console.error('[pos] QR generation error:', err);
      setPaymentLinkStatus('idle');
      setErrorMessage(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Failed to generate QR code');
    }
  };

  // ─── Invoice Sending ──────────────────────────────────────────────────────────────────

  // ─── Load hold into cart ──────────────────────────────────────────────────────────────

  const handleLoadHold = async (hold: HoldItem) => {
    // Add held item to cart
    addToCart({
      id: hold.itemId,
      title: hold.itemTitle,
      price: hold.itemPrice,
      status: 'AVAILABLE',
      photoUrls: [],
      sku: null,
    } as Item);
    // Set buyer email to shopper email
    setBuyerEmail(hold.shopperEmail);
    // Set linked shopper ID so Send to Phone button appears
    setLinkedShopperId(hold.shopperId || null);
    // Track the loaded hold
    setLoadedHold(hold);
    // ADR-114 follow-up (2026-08-31, same-session live-Chrome retest): a held item's
    // Item.status is RESERVED, not AVAILABLE -- every OTHER payment method (Cash, Stripe
    // QR, Card Reader, Venmo, Zelle, Send to Phone) posts to the generic walk-up endpoints
    // (e.g. POST /stripe/terminal/cash-payment via handleCashPayment), which require
    // AVAILABLE and reject a RESERVED item with a real 400 ("... is sold or unavailable") --
    // confirmed live even after the POS_CART routing fix, because that fix only closed the
    // POS_CART entry path; once loaded, the item still sits in the same shared `cart` array
    // every payment-method tab reads from. Auto-selecting 'invoice' here, combined with the
    // disabled guards on the other payment-method buttons below (search `loadedHold` in the
    // "How are they paying?" block), keeps the organizer on the one flow that actually knows
    // how to settle a hold (sendHoldInvoice, cash/card split already fixed this session).
    setPaymentMode('invoice');

    let mergedCount = 0;

    // Merge OTHER holds for the same shopper from the holds list
    const otherHolds = holds.filter(h => h.shopperId === hold.shopperId && h.reservationId !== hold.reservationId);
    otherHolds.forEach(otherHold => {
      addToCart({
        id: otherHold.itemId,
        title: otherHold.itemTitle,
        price: otherHold.itemPrice,
        status: 'AVAILABLE',
        photoUrls: [],
        sku: null,
      } as Item);
      mergedCount++;
    });

    // Pull shopper's shared cart (same flow as clicking a linked cart manually)
    if (selectedSaleId) {
      try {
        // _t busts Railway/browser cache that causes 304 with stale empty data
        const sessionRes = await api.get<{ sessions: LinkedCart[] }>(`/pos/sessions?saleId=${selectedSaleId}&_t=${Date.now()}`);
        const freshSessions = sessionRes.data.sessions || [];
        // Match by shopperId OR email: covers guest/account edge cases
        const shopperCart = freshSessions.find(
          lc => (hold.shopperId && lc.shopperId === hold.shopperId) || lc.shopperEmail === hold.shopperEmail
        );
        if (shopperCart && shopperCart.cartItems.length > 0) {
          // Use the proven pull flow: calls /pull endpoint then adds items exactly like the UI button does
          await handleAddLinkedCart(shopperCart.id, shopperCart.cartItems, shopperCart.shopperId, shopperCart.shopperEmail);
          mergedCount += shopperCart.cartItems.length;
        } else if (freshSessions.length === 0) {
          showToast(`No shared carts found. Shopper must tap "Share cart" in their app first`, 'info');
        } else {
          showToast(`No cart found for ${hold.shopperEmail} (${freshSessions.length} other cart${freshSessions.length !== 1 ? 's' : ''} open)`, 'info');
        }
        setLinkedCarts(freshSessions);
      } catch (err) {
        console.error('[pos] hold cart merge error:', err);
      }
    }

    if (otherHolds.length > 0 && mergedCount === otherHolds.length) {
      // Only other holds merged (no linked cart): show count
      showToast(`Loaded hold + ${mergedCount} item${mergedCount !== 1 ? 's' : ''} for ${hold.shopperName}`, 'success');
    } else if (mergedCount === 0) {
      showToast(`Loaded hold for ${hold.shopperName}`, 'success');
    }
    // If linked cart was merged, handleAddLinkedCart already showed its own toast
  };

  // ─── Load hold(s) passed via ?holdReservationIds= (from /organizer/holds "Add to POS
  // cart") ──────────────────────────────────────────────────────────────────────────────
  //
  // ADR-114 POS_CART fix (2026-08-31, same-session live-Chrome retest): holds.tsx's
  // POS_CART settlement mode navigates here with the resolved reservation ids in the
  // query string (see holds.tsx's batchMutation onSuccess) instead of relying on the old
  // POSSession/linked-carts pull -- that generic pull path adds items as plain walk-up
  // `cart` entries and checks out via the raw terminal endpoints, which correctly refuse a
  // still-RESERVED item (confirmed live: a real 400, "... is sold or unavailable", from
  // POST /stripe/terminal/cash-payment). `handleLoadHold` is the existing, already-correct
  // flow for a held item -- it sets `loadedHold`, which routes checkout through
  // sendHoldInvoice/PosInvoiceModal instead, and it already auto-merges any other holds
  // for the same shopper. Only the FIRST resolved reservation id is explicitly loaded here;
  // if the organizer selected holds for more than one shopper on the holds page, the
  // others are simply left in the Active Holds list to load separately -- `handleLoadHold`
  // has never supported multiple simultaneous invoices and this does not attempt to add
  // that.
  useEffect(() => {
    let raw: string | null = null;
    let saleIdFromUrl: string | null = null;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      raw = params.get('holdReservationIds');
      saleIdFromUrl = params.get('saleId');
    }
    if (!raw) {
      const q = router.query.holdReservationIds;
      raw = typeof q === 'string' && q ? q : null;
    }
    if (!raw) return;
    if (handledHoldReservationIdsRef.current === raw) return; // already handled this exact param
    if (holds.length === 0) return; // wait for /pos/holds to load before searching it

    const ids = raw.split(',').filter(Boolean);
    const match = holds.find(h => ids.includes(h.reservationId));
    handledHoldReservationIdsRef.current = raw; // mark handled even if not found -- don't retry forever
    if (match) {
      handleLoadHold(match);
    } else {
      showToast('Could not find that hold to load -- it may have expired or already been settled.', 'error');
    }

    // Clear the query param so a refresh doesn't try to re-load it.
    if (!saleIdFromUrl) {
      const s = router.query.saleId;
      saleIdFromUrl = typeof s === 'string' && s ? s : null;
    }
    router.replace({
      pathname: router.pathname,
      query: saleIdFromUrl ? { saleId: saleIdFromUrl } : {},
    }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holds, router.isReady, router.query.holdReservationIds]);

  // ─── Request Cart Share (organizer → shopper push) ────────────────────────────────────

  const handleRequestCartShare = async (hold: HoldItem) => {
    setCartShareRequesting(true);
    try {
      await api.post(`/pos/holds/${hold.reservationId}/request-cart`);
      setCartShareSent(true);
      showToast(`Cart request sent to ${hold.shopperName}'s phone`, 'success');
      // Poll for cart after a short delay: shopper's device may auto-share
      setTimeout(async () => {
        if (!selectedSaleId) return;
        try {
          const sessionRes = await api.get<{ sessions: LinkedCart[] }>(`/pos/sessions?saleId=${selectedSaleId}&_t=${Date.now()}`);
          const freshSessions = sessionRes.data.sessions || [];
          const shopperCart = freshSessions.find(
            lc => (hold.shopperId && lc.shopperId === hold.shopperId) || lc.shopperEmail === hold.shopperEmail
          );
          if (shopperCart && shopperCart.cartItems.length > 0) {
            await handleAddLinkedCart(shopperCart.id, shopperCart.cartItems, shopperCart.shopperId, shopperCart.shopperEmail);
            setLinkedCarts(freshSessions);
          }
        } catch { /* ignore */ }
      }, 4000);
    } catch {
      showToast('Failed to send cart request', 'error');
    } finally {
      setCartShareRequesting(false);
    }
  };

  // ─── Cancel hold from POS ──────────────────────────────────────────────────────────────

  const handleCancelHold = (hold: HoldItem) => {
    setConfirmState({
      open: true,
      title: 'Cancel Hold',
      message: `Cancel hold for ${hold.shopperName} on "${hold.itemTitle}"? This will release the item back to available.`,
      onConfirm: async () => {
        setCancellingSalesId(hold.reservationId);
        try {
          await api.delete(`/reservations/${hold.reservationId}`);
          // Remove from holds list
          setHolds(prev => prev.filter(h => h.reservationId !== hold.reservationId));
          // Clear loaded hold if this was the one
          if (loadedHold?.reservationId === hold.reservationId) {
            setLoadedHold(null);
            // Remove from cart
            setCart([]);
            setBuyerEmail('');
          }
          showToast(`Hold cancelled for ${hold.shopperName}`, 'success');
        } catch (err) {
          console.error('[pos] Cancel hold error:', err);
          showToast('Failed to cancel hold', 'error');
        } finally {
          setCancellingSalesId(null);
          setConfirmState(s => ({ ...s, open: false }));
        }
      },
    });
  };

  const handleSendInvoice = async (reservationId: string, shopperEmail: string, miscItems?: CartItem[]) => {
    try {
      const response = await api.post(`/pos/holds/${reservationId}/invoice`, { deliverVia: 'EMAIL', miscItems });
      setHolds(prev => prev.filter(h => h.reservationId !== reservationId));
      setLoadedHold(null);
      setCart([]);
      setBuyerEmail('');
      // P1 fix (2026-08-25, Charge C investigation): surface a real email-delivery failure
      // (e.g. a suppressed recipient) instead of always claiming success -- see the matching
      // fix in PosInvoiceModal.tsx for the full incident note.
      if (response?.data?.emailWarning) {
        showToast(response.data.emailWarning, 'warning');
      } else {
        showToast(`Invoice sent to ${shopperEmail}`, 'success');
      }
    } catch (err) {
      console.error('[pos] Send invoice error:', err);
      setErrorMessage('Failed to send invoice');
    }
  };

  // ─── Linked Cart Addition ─────────────────────────────────────────────────────────────

  const handleAddLinkedCart = async (
    sessionId: string,
    cartItems: LinkedCart['cartItems'],
    shopperId: string,
    shopperEmail: string,
  ) => {
    try {
      await api.post(`/pos/sessions/${sessionId}/pull`);
      // Add items to cart: pass catalog item id so itemIds are captured in payment requests
      cartItems.forEach(item => {
        if (item.id) {
          addToCart({ id: item.id, title: item.title, price: item.price, status: 'AVAILABLE', photoUrls: item.photoUrl ? [item.photoUrl] : [], sku: null } as Item);
        } else {
          addToCart({ title: item.title, amount: item.price });
        }
      });
      // Autofill shopper context for Send to Phone
      setLinkedShopperId(shopperId || null);
      if (shopperEmail) setBuyerEmail(shopperEmail);
      showToast(`${cartItems.length} item${cartItems.length !== 1 ? 's' : ''} added to cart`, 'success');
    } catch (err) {
      console.error('[pos] Add linked cart error:', err);
      setErrorMessage('Failed to add items from linked cart');
    }
  };

  // ─── Send to Phone ────────────────────────────────────────────────────────────────────────

  const handleSendToPhone = async () => {
    const shopperId = linkedShopperId || linkedShopperData?.id;
    if (!shopperId || !selectedSaleId || cart.length === 0) return;

    setPaymentStatus('creating');
    setErrorMessage('');

    try {
      const itemIds = cart.filter(c => c.itemId).map(c => c.itemId!);
      const totalAmountCents = Math.round(cartTotal * 100);
      const cashReceivedCents = Math.round(cashReceived * 100);

      // Calculate remaining balance: if cashReceived < cartTotal, card charges the remainder
      const remainingCents = cashReceivedCents > 0 && cashReceivedCents < totalAmountCents
        ? totalAmountCents - cashReceivedCents
        : 0;

      const payload: any = {
        shopperUserId: shopperId,
        saleId: selectedSaleId,
        itemIds, // may be empty for custom-amount carts. Backend handles gracefully
        totalAmountCents,
      };

      // POS Cashier Discount Permission (2026-08-28): totalAmountCents above already
      // nets out the discount (cartTotal is discount-adjusted) -- these fields let the
      // backend independently verify + permission-check that reduction rather than
      // trusting the total alone. See ADR-pos-cashier-discount-permission.md.
      if (discountAmount > 0) {
        payload.discountType = discountType;
        payload.discountValue = discountValueToSubmit;
        if (discountReasonNote.trim()) payload.discountReasonNote = discountReasonNote.trim();
      }

      // If split payment (cash + card), include split details
      if (remainingCents > 0) {
        payload.isSplitPayment = true;
        payload.cashAmountCents = cashReceivedCents;
        payload.cardAmountCents = remainingCents;
      }

      await api.post('/pos/payment-request', payload);

      setPaymentStatus('success');
      const shopperName = linkedShopperData?.name || buyerEmail || 'shopper';
      if (remainingCents > 0) {
        setSuccessMessage(`📱 Split payment request of $${(remainingCents / 100).toFixed(2)} (card) sent to ${shopperName}'s phone. Cash received: $${(cashReceivedCents / 100).toFixed(2)}.`);
      } else {
        setSuccessMessage(`📱 Payment request of $${cartTotal.toFixed(2)} sent to ${shopperName}'s phone.`);
      }
      // Refetch active requests to populate split payment details in pending panel
      queryClient.invalidateQueries({ queryKey: ['pos-active-payment-requests'] });
    } catch (err: any) {
      console.error('[pos] Send to Phone error:', err);
      setPaymentStatus('error');
      const msg = err?.response?.data?.message || 'Failed to send payment request';
      const detail = err?.response?.data?.error;
      setErrorMessage(detail ? `${msg}: ${detail}` : msg);
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
        <div className="flex items-center gap-3">
          {/* Sound toggle */}
          <button
            onClick={() => {
              const newState = !soundEnabled;
              setSoundEnabled(newState);
              if (typeof window !== 'undefined') {
                localStorage.setItem('pos_sound_enabled', JSON.stringify(newState));
              }
            }}
            className="text-xl p-2 hover:opacity-75 transition"
            aria-label={soundEnabled ? 'Sound on' : 'Sound off'}
          >
            {soundEnabled ? '🔔' : '🔇'}
          </button>

          {/* Reader status */}
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
      </div>

      {/* Sale selector -- hidden in venue mode (S1178 gap fix, 2026-07-30; sales source
          updated S1183 Fix 1, 2026-08-01): this block is fed by the "Fetch POS context"
          effect above (GET /pos/context), which loads for ANY authenticated user now,
          not just ORGANIZER-role ones -- gating is server-side. A team member/owner in
          venue mode always saw "No active sales. Publish a sale first." here regardless
          of whether venue mode itself was working -- confusing and unrelated to venue
          mode, which has its own item-add UI below and never uses selectedSaleId/sales
          at all. */}
      {!venueHubId && (
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
      )}

      {/* Venue mode: add item by ID/scan (S1178) -- no single saleId spans a multi-vendor hub */}
      {venueHubId && (
        <div className="mb-4">
          <div className="mb-2 px-3 py-2 rounded-lg bg-sage-50 dark:bg-sage-900/30 border border-sage-200 dark:border-sage-800 text-xs text-sage-800 dark:text-sage-300">
            Venue register. Items can belong to any vendor at this market.
          </div>
          {venueStartFailure && (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">{venueStartFailure}</p>
          )}
          {venueCart && (
            <button
              type="button"
              onClick={handleCancelVenueCart}
              className="mb-2 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline"
            >
              Cancel this cart
            </button>
          )}
          <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">Add item</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={venueItemSearch}
              onChange={e => setVenueItemSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && venueItemSearch.trim()) {
                  api.get<Item>(`/items/${venueItemSearch.trim()}`)
                    .then(res => {
                      // S1178 gap fix (2026-07-30): this is the venue-mode-only input
                      // block (`{venueHubId && (...)}` above) -- it must route through
                      // the booth-cart endpoint (addVenueItemToCart), not the plain
                      // single-organizer local cart (addToCart). Every item added here
                      // was silently going into the wrong cart path before this fix.
                      // S1178 consolidation (2026-08-01): merged the separate exact-ID
                      // input into this single search box. Enter still attempts an
                      // exact-ID lookup first (supports a hardware barcode-scanner
                      // wedge that types a code + Enter); it fails gracefully below
                      // if the typed text isn't a real item ID, which is fine since
                      // live search already covers the title/SKU case as you type.
                      addVenueItemToCart(res.data);
                      setVenueItemSearch('');
                      setVenueSearchResults([]);
                    })
                    .catch(() => setErrorMessage('Item not found.'));
                }
              }}
              placeholder="Search by title or SKU, or scan barcode…"
              // Cart-on-load UX trap fix (2026-09-06): used to disable on !venueCart, which
              // -- now that a cart is no longer auto-started on mount -- would permanently
              // lock this input on every fresh page load (no cart yet is the NORMAL resting
              // state, not something to block on). Only disable once we actually KNOW the
              // register can't open (venueStartFailure, e.g. the market is closed) --
              // preserves Bug B's closed-market disabling exactly, just no longer keyed off
              // cart existence.
              disabled={!!venueStartFailure}
              title={venueStartFailure || undefined}
              className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500 ${
                venueStartFailure
                  ? 'border-warm-200 dark:border-gray-700 bg-warm-100 dark:bg-gray-800 text-warm-400 dark:text-gray-600 cursor-not-allowed'
                  : 'border-warm-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100'
              }`}
            />
            <button
              onClick={() => setCameraOpen(true)}
              disabled={!!venueStartFailure}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                venueStartFailure
                  ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : 'bg-amber-600 text-white hover:bg-amber-700'
              }`}
              title="Scan QR code on price label"
            >
              📷
            </button>
          </div>

          {/* Hub-wide search by title or SKU (S1178 follow-up, 2026-07-31) --
              searches every vendor's items at this hub at once, since no single
              selectedSaleId spans a multi-vendor hub the way it does off venue mode. */}
          {venueSearchResults.length > 0 && (
            <ul className="mt-1 border border-warm-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm divide-y divide-warm-100 dark:divide-gray-700 max-h-48 overflow-y-auto">
              {venueSearchResults.map(item => (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      addVenueItemToCart(item);
                      setVenueItemSearch('');
                      setVenueSearchResults([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-warm-50 dark:hover:bg-gray-700 flex items-center justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-warm-900 dark:text-warm-100 truncate">{item.title}</span>
                      <span className="block text-xs text-warm-500 dark:text-warm-400 truncate">
                        {item.vendorName || 'Unknown booth'}{item.boothNumber ? ` (Booth ${item.boothNumber})` : ''}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-sage-700 ml-2 shrink-0">
                      +${item.price?.toFixed(2) ?? '0.00'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {venueItemSearch.trim().length > 1 && venueSearchResults.length === 0 && (
            <p className="mt-1 text-xs text-warm-400 dark:text-warm-500 italic">No available items match that search.</p>
          )}
        </div>
      )}

      {/* Item search + results */}
      {!venueHubId && selectedSaleId && (
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
                      +${item.price?.toFixed(2) ?? '0.00'}
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
      {!venueHubId && selectedSaleId && (
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
      {!venueHubId && selectedSaleId && (
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
      {!venueHubId && selectedSaleId && (
        <PosOpenCarts linkedCarts={linkedCarts} onPullCart={handleAddLinkedCart} onRemoveCart={handleRemoveCart} />
      )}

      {/* Linked shopper account banner */}
      {linkedShopperData && (
        <div className="mb-4 p-3 rounded-xl bg-sage-50 dark:bg-gray-800 border border-sage-300 dark:border-gray-600 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">👤</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 truncate">{linkedShopperData.name}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400">
                {linkedShopperData.holds?.length > 0
                  ? `${linkedShopperData.holds.length} active hold${linkedShopperData.holds.length !== 1 ? 's' : ''}`
                  : 'No active holds. Account linked for XP'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setLinkedShopperData(null)}
            className="text-warm-400 hover:text-warm-600 dark:hover:text-warm-200 text-xs shrink-0"
            title="Unlink account"
          >
            ✕
          </button>
        </div>
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
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-warm-900 dark:text-warm-100 truncate">{item.title}</p>
                    {loadedHold && item.itemId === loadedHold.itemId && (
                      <span className="px-1.5 py-0.5 text-xs rounded-full bg-sage-100 dark:bg-sage-900/30 text-sage-700 dark:text-sage-300 whitespace-nowrap">
                        📌 On Hold
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-2">
                  <span className="text-sm font-semibold text-sage-700 dark:text-green-400">
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
            {/* POS Cashier Discount Permission (2026-08-28): control is absent entirely
                (not disabled) for a cart-holder without the apply_pos_discount permission
                or an empty cart -- see claude_docs/ux-spotchecks/pos-cashier-discount-permission.md
                for why absence, not a disabled-with-tooltip control, is the correct signal. */}
            {canApplyDiscount && cart.length > 0 && discountOpen && (
              <div className="mb-3 p-3 rounded-md bg-warm-50 dark:bg-gray-700/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-warm-700 dark:text-warm-300">Discount</span>
                  <button
                    type="button"
                    onClick={() => { setDiscountOpen(false); setDiscountValueInput(''); setDiscountReasonNote(''); }}
                    className="text-xs text-warm-400 hover:text-warm-600 dark:hover:text-warm-200"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md overflow-hidden border border-warm-300 dark:border-gray-600 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDiscountType('PERCENT')}
                      className={`px-3 py-2 text-sm font-semibold min-w-[44px] min-h-[44px] ${discountType === 'PERCENT' ? 'bg-sage-600 text-white' : 'bg-white dark:bg-gray-700 text-warm-700 dark:text-warm-300'}`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType('FIXED')}
                      className={`px-3 py-2 text-sm font-semibold min-w-[44px] min-h-[44px] ${discountType === 'FIXED' ? 'bg-sage-600 text-white' : 'bg-white dark:bg-gray-700 text-warm-700 dark:text-warm-300'}`}
                    >
                      $
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={discountValueInput}
                    onChange={(e) => setDiscountValueInput(e.target.value)}
                    placeholder={discountType === 'PERCENT' ? 'e.g. 10' : 'e.g. 5.00'}
                    className="flex-1 min-h-[44px] px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white text-sm"
                  />
                </div>
                {discountExceedsCap && discountCapDollars != null && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Max for your role is {discountCap?.type === 'PERCENT' ? `${discountCap.value}%` : `$${discountCapDollars.toFixed(2)}`}. Applying ${discountAmount.toFixed(2)} instead.
                  </p>
                )}
                <input
                  type="text"
                  value={discountReasonNote}
                  onChange={(e) => setDiscountReasonNote(e.target.value)}
                  placeholder="Reason (optional)"
                  maxLength={280}
                  className="w-full min-h-[44px] px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white text-sm"
                />
              </div>
            )}

            {discountAmount > 0 && (
              <div className="flex justify-between text-warm-600 dark:text-warm-400 mb-1">
                <span>Subtotal:</span>
                <span>${cartSubtotal.toFixed(2)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between text-sage-700 dark:text-green-400 mb-1">
                <span>Discount:</span>
                <span>&minus;${discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-warm-900 dark:text-warm-100 mb-1">
              <span>Total:</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>

            {canApplyDiscount && cart.length > 0 && !discountOpen && (
              <button
                type="button"
                onClick={() => setDiscountOpen(true)}
                className="text-xs text-sage-600 dark:text-sage-400 hover:underline mb-2 min-h-[44px]"
              >
                Add discount
              </button>
            )}

            {/* Split Bill button (#406) -- hidden per Patrick decision 2026-08-24, code intact */}
            {ENABLE_SPLIT_BILL && cart.length > 0 && (
              <button
                onClick={() => {
                  setSplitBillOpen(o => !o);
                  setSplitCollected([]);
                  setSplitCustomAmounts(Array(splitCount).fill(''));
                }}
                className="mt-1 text-xs text-sage-700 dark:text-sage-400 hover:underline"
              >
                {splitBillOpen ? '✕ Close Split' : '⚖️ Split Bill'}
              </button>
            )}

            {/* Split Bill Panel (#406) -- hidden per Patrick decision 2026-08-24, code intact */}
            {ENABLE_SPLIT_BILL && splitBillOpen && cart.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-warm-50 dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
                <p className="text-xs font-semibold text-warm-700 dark:text-warm-300 mb-2">Split Bill</p>

                {/* Mode toggle */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => { setSplitMode('even'); setSplitCollected([]); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${splitMode === 'even' ? 'bg-sage-700 text-white' : 'bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-warm-300'}`}
                  >
                    Split Evenly
                  </button>
                  <button
                    onClick={() => { setSplitMode('custom'); setSplitCollected([]); setSplitCustomAmounts(Array(splitCount).fill('')); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${splitMode === 'custom' ? 'bg-sage-700 text-white' : 'bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-warm-300'}`}
                  >
                    Custom Amounts
                  </button>
                </div>

                {/* Shopper count */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs text-warm-600 dark:text-warm-400">Shoppers:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { const n = Math.max(2, splitCount - 1); setSplitCount(n); setSplitCollected([]); setSplitCustomAmounts(Array(n).fill('')); }}
                      className="w-7 h-7 rounded-full bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-warm-300 font-bold text-sm flex items-center justify-center hover:bg-warm-300 dark:hover:bg-gray-600"
                    >−</button>
                    <span className="text-sm font-bold text-warm-900 dark:text-warm-100 w-4 text-center">{splitCount}</span>
                    <button
                      onClick={() => { const n = Math.min(10, splitCount + 1); setSplitCount(n); setSplitCollected([]); setSplitCustomAmounts(Array(n).fill('')); }}
                      className="w-7 h-7 rounded-full bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-warm-300 font-bold text-sm flex items-center justify-center hover:bg-warm-300 dark:hover:bg-gray-600"
                    >+</button>
                  </div>
                </div>

                {/* Split slots */}
                <div className="space-y-2">
                  {Array.from({ length: splitCount }).map((_, i) => {
                    const evenAmount = Math.ceil((cartTotal * 100) / splitCount) / 100;
                    const displayAmount = splitMode === 'even'
                      ? evenAmount
                      : (parseFloat(splitCustomAmounts[i] || '0') || 0);
                    const collected = splitCollected[i] ?? false;

                    return (
                      <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border transition ${collected ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-gray-700 border-warm-200 dark:border-gray-600'}`}>
                        <span className="text-xs text-warm-500 dark:text-warm-400 w-14 shrink-0">Person {i + 1}</span>
                        {splitMode === 'custom' ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={splitCustomAmounts[i] ?? ''}
                            onChange={e => {
                              const arr = [...splitCustomAmounts];
                              arr[i] = e.target.value;
                              setSplitCustomAmounts(arr);
                            }}
                            placeholder="0.00"
                            className="flex-1 border border-warm-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-1 focus:ring-sage-500"
                          />
                        ) : (
                          <span className="flex-1 text-sm font-bold text-warm-900 dark:text-warm-100">${evenAmount.toFixed(2)}</span>
                        )}
                        <button
                          disabled={collected}
                          onClick={() => {
                            const arr = [...splitCollected];
                            arr[i] = true;
                            setSplitCollected(arr);
                          }}
                          className={`text-xs px-2 py-1 rounded-lg font-semibold transition ${collected ? 'bg-emerald-600 text-white cursor-default' : 'bg-sage-700 text-white hover:bg-sage-800'}`}
                        >
                          {collected ? '✓ Paid' : 'Collect'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Running tally */}
                <div className="mt-3 pt-2 border-t border-warm-200 dark:border-gray-700">
                  {(() => {
                    const collectedCount = splitCollected.filter(Boolean).length;
                    const evenAmount = Math.ceil((cartTotal * 100) / splitCount) / 100;
                    const collectedTotal = splitMode === 'even'
                      ? collectedCount * evenAmount
                      : splitCollected.reduce((sum, c, i) => sum + (c ? (parseFloat(splitCustomAmounts[i] || '0') || 0) : 0), 0);
                    const allDone = collectedCount === splitCount;

                    return allDone ? (
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 text-center">
                        ✓ Split complete. All {splitCount} paid
                      </p>
                    ) : (
                      <p className="text-xs text-warm-500 dark:text-warm-400 text-center">
                        {collectedCount} of {splitCount} collected · ${collectedTotal.toFixed(2)} of ${cartTotal.toFixed(2)}
                      </p>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Today's summary bar */}
          {todaySummary && todaySummary.transactionCount > 0 && (
            <div className="mt-3 pt-3 border-t border-warm-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 text-center">
              Today: ${(todaySummary.totalAmountCents / 100).toFixed(2)} · {todaySummary.transactionCount} sales
            </div>
          )}
        </div>
      )}

      {/* Buyer email */}
      {cart.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
            Buyer email <span className="text-warm-400 dark:text-warm-500 font-normal">(optional. For receipt)</span>
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

      {/* Slide-in success banner (paid) */}
      {paidBanner && (
        <div className="mb-4 overflow-hidden rounded-xl">
          <div className="translate-y-0 transition-all duration-300 bg-green-800 text-white p-4 flex items-center gap-3 h-20">
            <span className="text-2xl">✓</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {paidBanner.shopperName} · {paidBanner.displayAmount} · Paid
              </p>
              <div className="mt-2 h-1 bg-green-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 animate-pulse" style={{ animation: 'none' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Payments Panel */}
      {pendingPayments.length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <button
            onClick={() => setPendingPaymentsPanelOpen(!pendingPaymentsPanelOpen)}
            className="w-full flex items-center justify-between mb-0"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">⏳</span>
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                Pending Payments ({pendingPayments.length})
              </h3>
            </div>
            <span className="text-blue-600 dark:text-blue-400">
              {pendingPaymentsPanelOpen ? '▼' : '▶'}
            </span>
          </button>

          {pendingPaymentsPanelOpen && (
            <div className="mt-3 space-y-2">
              {pendingPayments.map((payment) => {
                const expiresAt = new Date(payment.expiresAt);
                const now = new Date();
                const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
                const minutesLeft = Math.floor(secondsLeft / 60);
                const secondsDisplay = secondsLeft % 60;

                return (
                  <div
                    key={payment.id}
                    className={`p-3 rounded-lg border transition ${
                      successPaymentId === payment.id
                        ? 'bg-green-100 dark:bg-green-900/30 border-green-400 dark:border-green-700'
                        : payment.status === 'ACCEPTED'
                        ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
                        : 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {payment.shopperName}
                        </p>
                      </div>
                      <div className="text-right ml-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 block">
                          {payment.displayAmount}
                        </span>
                        {payment.isSplitPayment && payment.cashAmountCents && payment.cardAmountCents && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Cash ${(payment.cashAmountCents / 100).toFixed(2)} + Card ${(payment.cardAmountCents / 100).toFixed(2)}
                          </p>
                        )}
                      </div>
                      {/* Cancel button */}
                      {cancellingId === payment.id ? (
                        <span className="text-gray-400 ml-2">⏳</span>
                      ) : (
                        <button
                          onClick={() => handleCancelPayment(payment.id)}
                          disabled={successPaymentId === payment.id}
                          className="ml-2 text-gray-400 hover:text-red-500 transition text-lg leading-none p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                          aria-label="Cancel payment request"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            successPaymentId === payment.id
                              ? 'bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100'
                              : payment.status === 'ACCEPTED'
                              ? 'bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100'
                              : 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100'
                          }`}
                        >
                          {successPaymentId === payment.id ? '✓ Paid' : payment.status}
                        </span>
                      </div>

                      <span className="text-gray-600 dark:text-gray-400">
                        {successPaymentId === payment.id
                          ? 'Processing...'
                          : payment.isExpired
                          ? 'Expired'
                          : minutesLeft > 0
                          ? `${minutesLeft}m ${secondsDisplay}s left`
                          : `${secondsDisplay}s left`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Payment method selector (2×2 grid) */}
      {(selectedSaleId || venueHubId) && (
        <div className="mb-4">
          {venueHubId ? (
            <>
              <h3 className="text-sm font-medium text-warm-700 dark:text-warm-300 mb-3">Venue register</h3>
              {/* Venue payment method toggle (S1178 follow-up, 2026-07-31): reuses the
                  SAME paymentMode state the non-venue flow below uses, just restricted
                  to 'card' | 'cash' here -- venue mode has no reader/QR/invoice/venmo
                  yet, only the tap-per-vendor card flow and cash. */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  onClick={() => setPaymentMode('card')}
                  // Cart-on-load UX trap fix (2026-09-06): was disabled={!venueCart}, which
                  // (with the mount-time auto-start now removed) would permanently disable
                  // mode selection before the cashier ever adds a first item -- switching
                  // payment mode doesn't touch the cart at all, so it never needed a cart to
                  // exist. Only disable once venueStartFailure confirms the register can't
                  // open at all (e.g. market closed).
                  disabled={!!venueStartFailure}
                  className={`py-3 rounded-xl font-semibold transition flex flex-col items-center justify-center gap-1 ${
                    venueStartFailure
                      ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                      : paymentMode === 'card'
                      ? 'bg-sage-700 text-white'
                      : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <span>💳</span><span className="text-xs">Card. Tap per vendor</span>
                </button>
                <button
                  onClick={() => {
                    setPaymentMode('cash');
                    setCashReceived(0);
                    setCashNumpadValue('');
                  }}
                  disabled={!!venueStartFailure}
                  className={`py-3 rounded-xl font-semibold transition flex flex-col items-center justify-center gap-1 ${
                    venueStartFailure
                      ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                      : paymentMode === 'cash'
                      ? 'bg-sage-700 text-white'
                      : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <span>💵</span><span className="text-xs">Cash</span>
                </button>
                <button
                  onClick={() => setPaymentMode('qr')}
                  disabled={cart.length === 0}
                  className={`py-3 rounded-xl font-semibold transition flex flex-col items-center justify-center gap-1 ${
                    paymentMode === 'qr'
                      ? 'bg-sage-700 text-white'
                      : cart.length === 0
                      ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                      : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <span>📲</span><span className="text-xs">QR. Scan to pay</span>
                </button>
              </div>
              {venueCheckoutFailure && (
                <p className="mb-2 text-sm text-red-600 dark:text-red-400">{venueCheckoutFailure}</p>
              )}
              {venueCheckoutOpen && venueBooths.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {venueBooths.map(b => (
                    <li key={b.vendorBoothId} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-warm-100 dark:bg-gray-800">
                      <span className="text-warm-800 dark:text-warm-200">{b.vendorName}. ${(b.subtotalCents / 100).toFixed(2)}</span>
                      <span className="text-xs font-medium text-warm-500 dark:text-warm-400">{venueBoothOutcomes[b.vendorBoothId] || 'pending'}</span>
                    </li>
                  ))}
                </ul>
              )}
              {paymentMode === 'cash' ? (
                <>
                  {/* Cash received numpad -- identical UI/state to the non-venue cash
                      flow further down (cashNumpadValue/cashReceived), just wired to
                      handleVenueCashPayment instead of handleCashPayment. */}
                  <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 shadow-sm mb-3">
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
                    onClick={handleVenueCashPayment}
                    disabled={!venueCart || cart.length === 0 || cashReceived < cartTotal || ['creating'].includes(paymentStatus)}
                    className="w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed bg-sage-700 text-white hover:bg-sage-800 active:scale-95"
                  >
                    {paymentStatus === 'creating' && 'Recording…'}
                    {(paymentStatus === 'idle' || paymentStatus === 'error' || paymentStatus === 'cancelled') &&
                      `💵 Record Cash Sale $${cartTotal.toFixed(2)}`}
                  </button>
                </>
              ) : paymentMode === 'qr' ? (
                <>
                  {/* Register-side QR display -- same generate/display/poll shape as
                      the non-venue paymentLink* QR flow (PosPaymentQr) further down,
                      using the same react-qr-code component already imported in this
                      file (see the Venmo QR block below for its other existing use). */}
                  {(venueQrStatus === 'idle') && (
                    <button
                      onClick={handleVenueGenerateQr}
                      disabled={!venueCart || cart.length === 0}
                      className="w-full py-4 rounded-xl font-semibold transition bg-sage-700 text-white hover:bg-sage-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      📲 Generate QR to pay ${cartTotal.toFixed(2)}
                    </button>
                  )}
                  {venueQrStatus === 'generating' && (
                    <button disabled className="w-full py-4 rounded-xl font-semibold bg-sage-700 text-white opacity-70">
                      Generating…
                    </button>
                  )}
                  {venueQrStatus === 'waiting' && venueQrUrl && (
                    <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 space-y-3">
                      <p className="text-xs text-warm-600 dark:text-warm-400 text-center">
                        Total: ${cartTotal.toFixed(2)}
                      </p>
                      <div className="flex justify-center bg-white p-3 rounded-lg">
                        <QRCode value={venueQrUrl} size={200} />
                      </div>
                      <p className="text-center text-xs text-warm-600 dark:text-warm-400">
                        Have the shopper scan this QR with their phone camera and enter their card there.
                      </p>
                      <p className="text-center text-sm text-warm-600 dark:text-warm-400">
                        ⏳ Waiting for payment…
                      </p>
                      <button
                        onClick={handleVenueQrReset}
                        className="w-full py-2 rounded-lg border border-warm-300 dark:border-gray-600 text-warm-600 dark:text-warm-400 text-sm hover:bg-warm-50 dark:hover:bg-gray-700 transition"
                      >
                        Cancel &amp; Regenerate
                      </button>
                    </div>
                  )}
                  {(venueQrStatus === 'confirmed' || venueCapturing) && (
                    <button disabled className="w-full py-4 rounded-xl font-semibold bg-sage-700 text-white opacity-70">
                      Finishing sale…
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={handleCharge}
                  disabled={!venueCart || cart.length === 0 || venueCapturing || (paymentStatus !== 'idle' && paymentStatus !== 'error' && paymentStatus !== 'cancelled')}
                  className="w-full py-4 rounded-xl font-semibold transition bg-sage-700 text-white hover:bg-sage-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {venueCapturing ? 'Finishing sale…' : `💳 Charge $${cartTotal.toFixed(2)}. Tap per vendor`}
                </button>
              )}
              {venueCaptureFailed && (
                <button
                  onClick={captureVenueAll}
                  className="w-full mt-2 py-3 rounded-xl font-semibold transition bg-amber-600 text-white hover:bg-amber-700"
                >
                  Try to finish the sale again
                </button>
              )}
              <p className="mt-2 text-xs text-warm-500 dark:text-warm-400">
                Venmo, Zelle, invoice, and payment-link modes are not yet supported for multi-vendor carts.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-medium text-warm-700 dark:text-warm-300 mb-3">How are they paying?</h3>
          <div className="grid grid-cols-2 gap-2">
            {/* Cash button */}
            <button
              onClick={() => {
                setPaymentMode('cash');
                setCashReceived(0);
                setCashNumpadValue('');
              }}
              disabled={!!loadedHold}
              title={loadedHold ? 'Item is on hold -- use Invoice to complete this sale' : ''}
              className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 ${
                loadedHold
                  ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : paymentMode === 'cash'
                  ? 'bg-sage-700 text-white'
                  : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-xl">💵</span>
              <span className="text-xs">Cash</span>
            </button>
            <button
              onClick={() => setPaymentMode('qr')}
              disabled={cart.length === 0 || !!loadedHold}
              title={loadedHold ? 'Item is on hold -- use Invoice to complete this sale' : ''}
              className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 ${
                paymentMode === 'qr'
                  ? 'bg-sage-700 text-white'
                  : cart.length === 0 || loadedHold
                  ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-xl">📲</span>
              <span className="text-xs">Stripe QR</span>
            </button>
            <button
              onClick={() => {
                if (readerStatus !== 'connected' || loadedHold) return;
                setPaymentMode('card');
                setNumpadOpen(false);
              }}
              disabled={readerStatus !== 'connected' || !!loadedHold}
              title={loadedHold ? 'Item is on hold -- use Invoice to complete this sale' : readerStatus !== 'connected' ? 'Tap the status indicator in the top corner to connect your reader' : ''}
              className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 ${
                paymentMode === 'card' && readerStatus === 'connected' && !loadedHold
                  ? 'bg-sage-700 text-white'
                  : readerStatus !== 'connected' || loadedHold
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
            {/* Venmo: peer-to-peer, organizer collects outside app, platform fee via Stripe */}
            <button
              onClick={() => setPaymentMode('venmo')}
              disabled={!!loadedHold}
              title={loadedHold ? 'Item is on hold -- use Invoice to complete this sale' : ''}
              className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 ${
                loadedHold
                  ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : paymentMode === 'venmo'
                  ? 'bg-[#3D95CE] text-white'
                  : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-xl">💜</span>
              <span className="text-xs">Venmo</span>
            </button>
            {/* Zelle: peer-to-peer, organizer collects outside app, platform fee via Stripe */}
            <button
              onClick={() => setPaymentMode('zelle')}
              disabled={!!loadedHold}
              title={loadedHold ? 'Item is on hold -- use Invoice to complete this sale' : ''}
              className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 ${
                loadedHold
                  ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : paymentMode === 'zelle'
                  ? 'bg-[#6D1ED4] text-white'
                  : 'bg-warm-200 text-warm-700 hover:bg-warm-300 dark:bg-gray-700 dark:text-warm-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-xl">⚡</span>
              <span className="text-xs">Zelle</span>
            </button>
            {/* Send to Phone: visible only when a shopper is linked via QR or cart pull */}
            {(linkedShopperId || linkedShopperData?.id) && (
              <button
                onClick={handleSendToPhone}
                disabled={cart.length === 0 || paymentStatus === 'creating' || !!loadedHold}
                title={loadedHold ? 'Item is on hold -- use Invoice to complete this sale' : cart.length === 0 ? 'Add items to cart first' : `Send $${cartTotal.toFixed(2)} to ${linkedShopperData?.name || buyerEmail || 'shopper'}'s phone`}
                className={`py-4 rounded-xl font-semibold transition flex flex-col items-center gap-1 col-span-2 ${
                  cart.length === 0 || paymentStatus === 'creating' || loadedHold
                    ? 'bg-warm-100 text-warm-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                    : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
                }`}
              >
                <span className="text-xl">📱</span>
                <span className="text-xs">
                  {paymentStatus === 'creating'
                    ? 'Sending…'
                    : (() => {
                        const cashReceivedCents = Math.round(cashReceived * 100);
                        const totalCents = Math.round(cartTotal * 100);
                        const remainingCents = cashReceivedCents > 0 && cashReceivedCents < totalCents
                          ? totalCents - cashReceivedCents
                          : 0;
                        return remainingCents > 0
                          ? `Send $${(remainingCents / 100).toFixed(2)} to Phone`
                          : `Send $${cartTotal.toFixed(2)} to Phone`;
                      })()}
                </span>
              </button>
            )}
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
            </>
          )}
        </div>
      )}

      {/* Payment Method: Manual Card Entry */}
      {!venueHubId && paymentMode === 'manual_card' && cart.length > 0 && (
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
      {!venueHubId && paymentMode === 'qr' && cart.length > 0 && (
        <PosPaymentQr
          cartTotal={cartTotal}
          paymentAmount={paymentLinkAmount || cardAmount}
          paymentLinkId={paymentLinkId}
          paymentLinkQr={paymentLinkQr}
          paymentLinkUrl={paymentLinkUrl}
          paymentLinkStatus={paymentLinkStatus}
          buyerEmail={buyerEmail}
          onEmailLink={buyerEmail && paymentLinkUrl ? async () => {
            await api.post('/pos/payment-links/email', {
              paymentLinkUrl,
              buyerEmail,
              amount: paymentLinkAmount || cardAmount,
            });
          } : undefined}
          onGenerate={handleGeneratePaymentQr}
          onNewTransaction={handleNewTransaction}
          onReset={handleResetPaymentQr}
        />
      )}

      {/* Payment Method: Invoice/Holds */}
      {!venueHubId && paymentMode === 'invoice' && (
        <div className="mb-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-warm-900 dark:text-warm-100">📧 Send Invoice</h4>
            <button
              onClick={() => refreshHolds()}
              disabled={holdsLoading}
              className="text-xs px-2 py-1 rounded bg-warm-100 dark:bg-warm-700 text-warm-900 dark:text-warm-100 hover:bg-warm-200 dark:hover:bg-warm-600 disabled:opacity-50 transition"
            >
              {holdsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Shopper Lookup */}
          <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search by Shopper Email:
            </label>
            <input
              type="email"
              placeholder="Enter shopper email..."
              value={shopperSearchEmail}
              onChange={(e) => handleShopperEmailSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm placeholder-gray-500 dark:placeholder-gray-400"
            />
            {shopperSearchLoading && (
              <p className="text-xs text-warm-600 dark:text-warm-400 mt-2">Searching…</p>
            )}
            {shopperSearchEmail && shopperSearchResults.length > 0 && (
              <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                {shopperSearchResults.map((hold) => (
                  <div
                    key={hold.reservationId}
                    className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 flex justify-between items-start gap-2"
                  >
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">{hold.itemTitle}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">${(hold.itemPrice).toFixed(2)}</p>
                    </div>
                    <button
                      onClick={() => {
                        handleLoadHold(hold);
                        setShopperSearchEmail('');
                        setShopperSearchResults([]);
                      }}
                      className="px-2 py-1 text-xs rounded bg-sage-600 text-white hover:bg-sage-700 transition whitespace-nowrap"
                    >
                      Pull
                    </button>
                  </div>
                ))}
              </div>
            )}
            {shopperSearchEmail && !shopperSearchLoading && shopperSearchResults.length === 0 && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">No holds found for this email.</p>
            )}
          </div>

          {holdsLoading && <p className="text-sm text-warm-600 dark:text-warm-400">Loading holds…</p>}

          {!holdsLoading && holds.length === 0 && cart.length === 0 && (
            <p className="text-sm text-warm-600 dark:text-warm-400">No active holds or cart items. Add items or create holds first.</p>
          )}

          {!holdsLoading && holds.length > 0 && (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {holds.map(hold => (
                <div
                  key={hold.reservationId}
                  className={`p-3 rounded-lg border ${
                    loadedHold?.reservationId === hold.reservationId
                      ? 'bg-sage-50 dark:bg-gray-600 border-sage-300 dark:border-sage-600'
                      : 'bg-warm-50 dark:bg-gray-700 border-warm-200 dark:border-gray-600'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{hold.shopperName}</p>
                      <p className="text-xs text-warm-500 dark:text-warm-400">{hold.shopperEmail}</p>
                    </div>
                    <span className="text-sm font-bold text-sage-700 dark:text-sage-400">${(hold.itemPrice).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-warm-600 dark:text-warm-400 mb-3">{hold.itemTitle}</p>
                  <div className="flex gap-2">
                    {loadedHold?.reservationId === hold.reservationId ? (
                      <>
                        <button
                          onClick={() => setInvoiceModalHold(hold)}
                          className="flex-1 py-2 rounded-lg bg-sage-700 text-white text-xs font-semibold hover:bg-sage-800 transition"
                        >
                          Send Invoice
                        </button>
                        <button
                          onClick={() => handleCancelHold(hold)}
                          disabled={cancellingSalesId === hold.reservationId}
                          className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          {cancellingSalesId === hold.reservationId ? 'Cancelling...' : 'Cancel Hold'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleLoadHold(hold)}
                          className="flex-1 py-2 rounded-lg bg-warm-200 dark:bg-warm-700 text-warm-900 dark:text-warm-100 text-xs font-semibold hover:bg-warm-300 dark:hover:bg-warm-600 transition"
                        >
                          Load Hold
                        </button>
                        <button
                          onClick={() => setInvoiceModalHold(hold)}
                          className="flex-1 py-2 rounded-lg bg-sage-700 text-white text-xs font-semibold hover:bg-sage-800 transition"
                        >
                          Invoice
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invoice Preview (when hold is loaded) */}
          {loadedHold && (
            <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase">Invoice Preview</p>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">📌 Hold: {loadedHold.itemTitle}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">${loadedHold.itemPrice.toFixed(2)}</span>
                </div>
                {cart.filter(item => item.itemId !== loadedHold.itemId).length > 0 && (
                  <>
                    {cart.filter(item => item.itemId !== loadedHold.itemId).map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-gray-700 dark:text-gray-300">{item.title}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">${item.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </>
                )}
                <div className="border-t border-gray-200 dark:border-gray-600 pt-1.5 flex justify-between font-semibold text-gray-900 dark:text-white">
                  <span>Total</span>
                  <span>${(loadedHold.itemPrice + cart.filter(item => item.itemId !== loadedHold.itemId).reduce((sum, item) => sum + item.amount, 0)).toFixed(2)}</span>
                </div>
                {cashReceived > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                      <span>Cash Collected</span>
                      <span className="text-emerald-600 dark:text-emerald-400">-${cashReceived.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-sage-700 dark:text-sage-400">
                      <span>Remaining to Charge</span>
                      <span>${Math.max(0, loadedHold.itemPrice + cart.filter(item => item.itemId !== loadedHold.itemId).reduce((sum, item) => sum + item.amount, 0) - cashReceived).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => setInvoiceModalHold(loadedHold)}
                className="mt-2 w-full py-2 rounded-lg bg-sage-700 text-white text-xs font-semibold hover:bg-sage-800 transition"
              >
                📧 Send Invoice to {loadedHold.shopperEmail}
              </button>
              {/* Request Cart: sends push to shopper's device to auto-share their cart */}
              {!cartShareSent ? (
                <button
                  onClick={() => { setCartShareSent(false); handleRequestCartShare(loadedHold); }}
                  disabled={cartShareRequesting}
                  className="mt-2 w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {cartShareRequesting ? 'Sending…' : '📲 Request Cart from Shopper'}
                </button>
              ) : (
                <div className="mt-2 w-full py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold text-center">
                  ✓ Cart request sent. Waiting for shopper
                </div>
              )}
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
                <span className="text-emerald-700 dark:text-emerald-400">Platform fee{lastCashFee.isTestTransaction ? ' (not charged)' : ''}:</span>
                <span className="font-semibold text-emerald-900 dark:text-emerald-300">${lastCashFee.platformFee.toFixed(2)}</span>
              </div>
              {/* Test Transaction safety net UI (2026-08-29): terminalController.ts
                  computes platformFee for a test transaction (so the math is genuinely
                  exercised) but deliberately never accrues it to cashFeeBalance -- the
                  old unconditional "will be deducted" copy was misleading here. */}
              {lastCashFee.isTestTransaction ? (
                <p className="text-xs text-amber-700 dark:text-amber-400 italic">
                  🧪 Test transaction. This fee was calculated but NOT charged or added to your balance.
                </p>
              ) : (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 italic">This fee will be deducted from your next payout.</p>
              )}
              {!lastCashFee.isTestTransaction && lastCashFee.cashFeeBalance > 0 && (
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

      {/* Test Transaction safety net UI (2026-08-29): only meaningful for the
          cash/venmo/zelle path -- handleVenueCashPayment (booth-cart flow) and the
          Stripe card/terminal path do not accept isTestTransaction server-side, so the
          control is intentionally scoped to those three modes only. */}
      {!venueHubId && paymentStatus !== 'success' && cart.length > 0 &&
        (paymentMode === 'cash' || paymentMode === 'venmo' || paymentMode === 'zelle') && (
        <label
          className={`mb-3 flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition ${
            isTestTransaction
              ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700'
              : 'bg-warm-50 dark:bg-gray-700/50 border-warm-200 dark:border-gray-600'
          }`}
        >
          <input
            type="checkbox"
            checked={isTestTransaction}
            onChange={(e) => setIsTestTransaction(e.target.checked)}
            className="w-5 h-5 accent-amber-600"
          />
          <span className="text-sm">
            <span className={`font-semibold ${isTestTransaction ? 'text-amber-800 dark:text-amber-300' : 'text-warm-700 dark:text-warm-300'}`}>
              🧪 Test transaction
            </span>
            <span className="block text-xs text-warm-500 dark:text-warm-400">
              No real inventory sold, no fee charged, no receipt sent. Use for testing only.
            </span>
          </span>
        </label>
      )}

      {isTestTransaction && !venueHubId && paymentStatus !== 'success' && cart.length > 0 &&
        (paymentMode === 'cash' || paymentMode === 'venmo' || paymentMode === 'zelle') && (
        <div className="mb-3 p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-center">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
            ⚠️ Test mode active. This sale will not count as real
          </p>
        </div>
      )}

      {/* Charge buttons */}
      {!venueHubId && paymentStatus !== 'success' && cart.length > 0 && (
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
                  `Charge $${cardAmount.toFixed(2)}`}
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
                    {cashReceived > 0 && cashReceived < cartTotal && (linkedShopperId || linkedShopperData?.id) && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Tap "Send to Phone" to charge ${(cartTotal - cashReceived).toFixed(2)} to their card
                      </p>
                    )}
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
                  `${isTestTransaction ? '🧪 TEST: ' : ''}Record Cash Sale $${cartTotal.toFixed(2)}`}
              </button>
            </>
          )}

          {/* Venmo payment section */}
          {paymentMode === 'venmo' && (
            <>
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">Pay with Venmo</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                  The buyer pays you directly via Venmo. You collect the full ${cartTotal.toFixed(2)} yourself. FindA.Sale will deduct its platform fee from your next Stripe payout.
                </p>
                {organizerVenmo ? (
                  (() => {
                    const selectedSaleTitle = sales.find(s => s.id === selectedSaleId)?.title || 'FindA.Sale Purchase';
                    const venmoUrl = `https://venmo.com/${organizerVenmo}?txn=pay&amount=${cartTotal.toFixed(2)}&note=${encodeURIComponent(selectedSaleTitle)}`;
                    return (
                      <div className="flex flex-col items-center gap-2 mb-3">
                        <div className="bg-white dark:bg-warm-800 p-3 rounded-xl border border-blue-200 dark:border-blue-700">
                          <QRCode value={venmoUrl} size={160} />
                        </div>
                        <p className="text-xs text-blue-700 dark:text-blue-300 text-center">
                          <span className="font-semibold">@{organizerVenmo}</span> &middot; ${cartTotal.toFixed(2)}
                        </p>
                        <button
                          onClick={() => { navigator.clipboard.writeText(organizerVenmo!); showToast('Venmo handle copied', 'success'); }}
                          className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/60 transition font-medium"
                        >
                          @{organizerVenmo}. Tap to copy
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  <a
                    href="/organizer/settings#profile"
                    className="inline-block text-xs text-blue-600 dark:text-blue-400 underline mb-3"
                  >
                    Add your Venmo handle in Settings →
                  </a>
                )}
              </div>
              <button
                onClick={() => handlePeerToPeerPayment('venmo')}
                disabled={['creating'].includes(paymentStatus)}
                className="w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed bg-[#3D95CE] text-white hover:bg-[#3285be] active:scale-95"
              >
                {paymentStatus === 'creating' && 'Recording…'}
                {(paymentStatus === 'idle' || paymentStatus === 'error' || paymentStatus === 'cancelled') &&
                  `${isTestTransaction ? '🧪 TEST: ' : ''}Record Venmo Sale $${cartTotal.toFixed(2)}`}
              </button>
            </>
          )}

          {/* Zelle payment section */}
          {paymentMode === 'zelle' && (
            <>
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-1">Pay with Zelle</p>
                <p className="text-xs text-purple-700 dark:text-purple-300 mb-3">
                  The buyer pays you directly via Zelle. You collect the full ${cartTotal.toFixed(2)} yourself. FindA.Sale will deduct its platform fee from your next Stripe payout.
                </p>
                {organizerZelle ? (
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-purple-900 dark:text-purple-100 tracking-wide">{organizerZelle}</span>
                      <span className="text-lg font-semibold text-purple-700 dark:text-purple-300">&mdash; ${cartTotal.toFixed(2)}</span>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(organizerZelle!); showToast('Zelle handle copied', 'success'); }}
                      className="self-start text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/60 transition font-medium"
                    >
                      Tap to copy handle
                    </button>
                    <p className="text-xs text-purple-600 dark:text-purple-400">Send to {organizerZelle} in your bank app</p>
                  </div>
                ) : (
                  <a
                    href="/organizer/settings#profile"
                    className="inline-block text-xs text-purple-600 dark:text-purple-400 underline mb-3"
                  >
                    Add your Zelle handle in Settings →
                  </a>
                )}
              </div>
              <button
                onClick={() => handlePeerToPeerPayment('zelle')}
                disabled={['creating'].includes(paymentStatus)}
                className="w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-40 disabled:cursor-not-allowed bg-[#6D1ED4] text-white hover:bg-[#5e1ab8] active:scale-95"
              >
                {paymentStatus === 'creating' && 'Recording…'}
                {(paymentStatus === 'idle' || paymentStatus === 'error' || paymentStatus === 'cancelled') &&
                  `${isTestTransaction ? '🧪 TEST: ' : ''}Record Zelle Sale $${cartTotal.toFixed(2)}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Platform fee note */}
      {!venueHubId && cart.length > 0 && paymentMode === 'card' && paymentStatus === 'idle' && (
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
          miscItems={cart.filter(item => item.itemId !== invoiceModalHold.itemId)}
          cashAmountCents={cashReceived > 0 ? Math.round(cashReceived * 100) : undefined}
          onClose={() => setInvoiceModalHold(null)}
          onSent={(reservationId) => {
            setHolds(prev => prev.filter(h => h.reservationId !== reservationId));
            setLoadedHold(null);
            setCart([]);
            setBuyerEmail('');
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

            <div className="relative w-full cursor-pointer" role="button" tabIndex={0} onClick={(e) => scanOnTap(e)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scanOnTap(e as any); } }} aria-label="QR code scanner">
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
              Point at a QR code, then tap the screen to scan
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={() => confirmState.onConfirm()}
        onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
      />
    </>
  );
}
