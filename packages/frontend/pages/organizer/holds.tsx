/**
 * Feature #24: Holds-Only Item View
 * Upgraded organizer hold management page.
 * Filter by sale, sort by expiry/created, grouped-by-buyer display,
 * batch actions (release, extend, mark sold), item photos + prices.
 */

import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import HoldTimer from '../../components/HoldTimer';
import FraudBadge from '../../components/FraudBadge';
import EmptyState from '../../components/EmptyState';
import { formatDistanceToNow, parseISO } from 'date-fns';
import HoldToPayModal from '../../components/HoldToPayModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import { getPlatformFeeRate, formatFeeRate } from '../../lib/platformFees';

// Helper: Map explorer rank to badge emoji and description
function getRankBadge(rank?: string): { emoji: string; label: string; description: string } {
  switch (rank) {
    case 'GRANDMASTER':
      return {
        emoji: '👑',
        label: 'Grandmaster',
        description: 'Grandmaster buyers almost always follow through.',
      };
    case 'SAGE':
      return {
        emoji: '🧙',
        label: 'Sage',
        description: 'One of your best potential customers. High purchase completion rate.',
      };
    case 'RANGER':
      return {
        emoji: '🧗',
        label: 'Ranger',
        description: 'Active buyer. Visits sales frequently and completes purchases.',
      };
    case 'SCOUT':
      return {
        emoji: '🐦',
        label: 'Scout',
        description: 'Has visited multiple sales. Starting to become a regular.',
      };
    case 'INITIATE':
    default:
      return {
        emoji: '⚔️',
        label: 'Initiate',
        description: 'New to FindA.Sale. First hold or purchase.',
      };
  }
}

// markSold settlement router (Decision A): how to settle when "Mark Sold" is clicked.
// 'AUTO' lets the server pick the best mode for the sale type.
// 'HOLD_INVOICE' (#221) is handled entirely on the client — it opens the Hold-to-Pay
// modal instead of hitting /reservations/batch, because that path is a per-reservation
// endpoint (POST /reservations/:id/mark-sold) that bundles every item the shopper is
// holding at the sale into ONE Stripe invoice. It is never sent as a settlementMode.
type SettlementChoice = 'AUTO' | 'RECORD' | 'POS_CART' | 'CHECKOUT_LINK' | 'HOLD_INVOICE';

// Plain-language description of each option, shown under the picker so the organizer
// knows what will actually happen before committing.
const SETTLEMENT_HELP: Record<SettlementChoice, string> = {
  AUTO: 'We pick the method that fits this sale.',
  RECORD: 'Records a cash or in-person sale. You keep the cash; your commission is added to your fee balance and comes out of your next payout.',
  POS_CART: 'Adds the items to your POS cart so you can finish at checkout.',
  CHECKOUT_LINK: 'Creates a payment link you can show or send to the shopper.',
  HOLD_INVOICE:
    'Emails the shopper an itemized invoice with a secure payment link. Everything they are holding at this sale is bundled into one payment.',
};

interface HoldItem {
  id: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  note: string | null;
  // Set once a Hold-to-Pay invoice exists for this hold. GET /reservations/organizer
  // returns the full reservation row, so this has always been on the wire — it just was
  // not typed or displayed, which is why an organizer had no way to tell that a payment
  // request was already out on a hold.
  invoiceId?: string | null;
  user: { id: string; name: string; email: string; fraudConfidenceScore?: number; explorerRank?: string };
  item: {
    id: string;
    title: string;
    price: number | null;
    photoUrls: string[];
    sale: { id: string; title: string };
  };
}

const OrganizerHoldsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [saleFilter, setSaleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'expiry' | 'created'>('expiry');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [settlementMode, setSettlementMode] = useState<SettlementChoice>('AUTO');
  // Test Transaction safety net UI (2026-08-29): mirrors the same toggle in
  // pos.tsx. Only meaningful for RECORD (reservationController.batchUpdateHolds's
  // markSold/RECORD branch is the only settlement path wired to accept this flag
  // server-side) -- reset whenever settlementMode leaves RECORD or a batch completes.
  const [isTestTransaction, setIsTestTransaction] = useState(false);

  // Commission rate for the cash-sale confirmation copy. Read from auth context (no extra
  // request) and resolved through lib/platformFees so PRO/TEAMS see 8%, not a hardcoded 10%.
  // A cash sale settled here is money FindA.Sale never touches, so the commission on it is
  // billed against the organizer's next payout instead — the organizer has to be told that
  // BEFORE they confirm, not discover it when a payout arrives smaller than expected.
  const { tier: organizerTier } = useOrganizerTier();
  const commissionRate = getPlatformFeeRate(organizerTier);
  const commissionLabel = formatFeeRate(organizerTier);

  // Hold-to-Pay modal state (#221)
  const [showPayModal, setShowPayModal] = useState(false);
  const [payModalHold, setPayModalHold] = useState<HoldItem | null>(null);

  // Confirmation gate for Mark Sold. Marking sold is a settlement action — on the RECORD
  // path it writes a PAID Purchase row and decrements stock immediately — so it never
  // fires straight off a single click.
  const [pendingSettlement, setPendingSettlement] = useState<{ ids: string[]; mode: SettlementChoice; isTestTransaction: boolean } | null>(null);
  // Hold-to-Pay (#221) reclaim path: the hold whose outstanding payment request is about
  // to be cancelled. Confirmed before it fires — cancelling voids the shopper's live
  // payment link.
  const [pendingRelease, setPendingRelease] = useState<HoldItem | null>(null);

  // Initialize saleFilter from query param on mount
  React.useEffect(() => {
    if (router.isReady && router.query.saleId) {
      setSaleFilter(router.query.saleId as string);
    }
  }, [router.isReady, router.query.saleId]);

  // Fetch holds with filters
  const { data: holds = [], isLoading: holdsLoading, isError: holdsError } = useQuery({
    queryKey: ['organizer-holds', saleFilter, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams({ sort: sortBy });
      if (saleFilter !== 'all') params.set('saleId', saleFilter);
      const response = await api.get(`/reservations/organizer?${params}`);
      return (response.data.holds ?? []) as HoldItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  // Fetch organizer's sales for filter dropdown
  const { data: salesData, isError: salesError } = useQuery({
    queryKey: ['organizer-sales-list', user?.id],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return response.data.sales as { id: string; title: string }[];
    },
    enabled: !!user?.id,
  });

  // Single hold update (confirm/cancel)
  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/reservations/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer-holds'] });
      showToast('Hold updated', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to update hold', 'error');
    },
  });

  // Cancel an outstanding payment request (Hold-to-Pay #221).
  //
  // Why this exists (P2/P1, 2026-08-17): POST /reservations/:id/release-invoice has been
  // live on the server the whole time and had ZERO frontend callers — grep-confirmed.
  // Two real consequences: this page's own copy told the organizer to "Cancel it first"
  // with no control to do it, and an item on an unpaid invoice with no Stripe session
  // (POS cash) had no reclaim path at all and sat at INVOICE_ISSUED forever. The server
  // cancels the invoice, closes the Stripe payment link, returns every bundled item to
  // RESERVED and clears the invoice link so a fresh request can be sent.
  const releaseInvoiceMutation = useMutation({
    mutationFn: (id: string) => api.post(`/reservations/${id}/release-invoice`),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['organizer-holds'] });
      const count = res?.data?.itemsReleased ?? 1;
      showToast(
        count > 1
          ? `Payment request cancelled. ${count} items are back on hold for the shopper.`
          : 'Payment request cancelled. The item is back on hold for the shopper.',
        'success'
      );
    },
    onError: (err: any) => {
      // 409 = already paid, or already cancelled/expired. 502 = the payment link could
      // not be closed, so the server deliberately left the request in place rather than
      // free the item alongside a live link. The server's copy says which; surface it.
      if (err.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['organizer-holds'] });
      }
      showToast(
        err.response?.data?.message || 'Could not cancel that payment request. Please try again.',
        'error'
      );
    },
  });

  // Batch mutation — also carries the markSold settlement mode (Decision A)
  const batchMutation = useMutation({
    mutationFn: ({ ids, action, settlementMode: mode, isTestTransaction: testTxn }: { ids: string[]; action: string; settlementMode?: SettlementChoice; isTestTransaction?: boolean }) => {
      const body: { ids: string[]; action: string; settlementMode?: string; isTestTransaction?: boolean } = { ids, action };
      // 'AUTO' = omit so the server resolves the default for the sale type.
      // 'HOLD_INVOICE' is a client-side route to the Hold-to-Pay modal and is not a
      // value this endpoint accepts — guard it here too so it can never leak into a body.
      if (mode && mode !== 'AUTO' && mode !== 'HOLD_INVOICE') body.settlementMode = mode;
      // Test Transaction safety net UI (2026-08-29): only ever meaningful alongside
      // settlementMode RECORD -- sent regardless, server-side it's a no-op for any
      // other mode since only the RECORD branch reads it.
      if (testTxn) body.isTestTransaction = true;
      return api.post('/reservations/batch', body);
    },
    onSuccess: (res: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organizer-holds'] });
      setSelectedIds(new Set());
      setIsTestTransaction(false);
      const data = res.data || {};
      // Use variables.ids.length as the reliable count — selectedIds has been cleared by now
      const count = data.updated ?? variables.ids.length;
      if (data.settlementMode === 'CHECKOUT_LINK' && data.paymentLinkUrl) {
        showToast('Checkout link created and sent to the shopper.', 'success');
        window.open(data.paymentLinkUrl, '_blank', 'noopener');
      } else if (data.settlementMode === 'POS_CART' || data.cartCount != null) {
        const cartCount = data.cartCount ?? count;
        showToast(`Added to POS cart (${cartCount} item${cartCount === 1 ? '' : 's'}). Finish at checkout.`, 'success');
      } else if (data.updated === 0) {
        // Server found nothing left to act on (already settled, released, or expired).
        // Say so plainly rather than reporting a success that did not happen.
        showToast('Nothing to update — those holds have already been handled.', 'error');
      } else if (data.settlementMode === 'RECORD') {
        // Report the commission the SERVER actually accrued (data.platformFee) and the running
        // balance it now sits in, not a client-side recomputation — those are the numbers the
        // organizer's next payout will be reduced by.
        const fee = typeof data.platformFee === 'number' ? data.platformFee : null;
        const balance = typeof data.cashFeeBalance === 'number' ? data.cashFeeBalance : null;
        const base = `${count} item${count === 1 ? '' : 's'} marked sold and cleared from your holds.`;
        showToast(
          fee && fee > 0
            ? `${base} $${fee.toFixed(2)} commission added to your fee balance${
                balance != null ? ` (now $${balance.toFixed(2)})` : ''
              } — it comes out of your next payout.`
            : base,
          'success'
        );
      } else {
        showToast(`${count} hold${count === 1 ? '' : 's'} updated.`, 'success');
      }
    },
    onError: (err: any) => {
      // 409 = the server's idempotency guard rejected a repeat settlement. The list on
      // screen is stale, so refresh it instead of leaving a row that no longer exists.
      if (err.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['organizer-holds'] });
        setSelectedIds(new Set());
      }
      showToast(err.response?.data?.message || 'Batch update failed', 'error');
    },
  });

  // Group holds by buyer
  const groupedByBuyer = useMemo(() => {
    const groups: Record<string, { buyerName: string; buyerEmail: string; holds: HoldItem[] }> = {};
    for (const hold of holds) {
      const key = hold.user.id;
      if (!groups[key]) {
        groups[key] = { buyerName: hold.user.name, buyerEmail: hold.user.email, holds: [] };
      }
      groups[key].holds.push(hold);
    }
    return Object.values(groups).sort((a, b) => b.holds.length - a.holds.length);
  }, [holds]);

  // Which holds get invoiced TOGETHER. POST /reservations/:id/mark-sold bundles every
  // hold the same shopper has at the same sale into ONE invoice, so "Send Invoice" on a
  // single card can produce a multi-item bill. Mirror that rule here (shopper + sale) so
  // the organizer can see the bundle on the card, before they commit to sending it.
  const bundleKey = (h: HoldItem) => `${h.user.id}::${h.item.sale.id}`;
  const bundlesByKey = useMemo(() => {
    const map: Record<string, HoldItem[]> = {};
    for (const hold of holds) {
      const key = `${hold.user.id}::${hold.item.sale.id}`;
      (map[key] ||= []).push(hold);
    }
    return map;
  }, [holds]);

  // Accordion state for buyer groups
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set());

  if (!isLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === holds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(holds.map((h) => h.id)));
    }
  };

  // True once a real invoice exists for this hold. As of the 2026-08-16 P0 fix,
  // invoiceId is only ever a real HoldInvoice.id or null — in-flight claims live in
  // ItemReservation.invoiceClaimToken/invoiceClaimedAt and never touch this field.
  const hasInvoice = (h: HoldItem) => !!h.invoiceId;

  // Hold-to-Pay (#221): open the payment-request modal for the selected holds. The
  // server endpoint is per-reservation and bundles every item that shopper is holding at
  // the sale, so one anchor hold is enough — but the selection has to describe a single
  // shopper at a single sale or the organizer would not be seeing what they are sending.
  const openPaymentRequest = (ids: string[]) => {
    const chosen = holds.filter((h) => ids.includes(h.id));
    if (chosen.length === 0) return;
    if (new Set(chosen.map((h) => h.user.id)).size > 1) {
      showToast('A payment request goes to one shopper at a time. Select holds for a single shopper.', 'error');
      return;
    }
    if (new Set(chosen.map((h) => h.item.sale.id)).size > 1) {
      showToast('A payment request covers one sale at a time. Select holds from a single sale.', 'error');
      return;
    }
    if (chosen.some(hasInvoice)) {
      showToast('You have already sent this shopper a payment request. Cancel it first if you need to change it.', 'error');
      return;
    }
    setPayModalHold(chosen[0]);
    setShowPayModal(true);
  };

  const handleBatch = (action: 'release' | 'extend' | 'markSold') => {
    if (selectedIds.size === 0) return;
    if (action === 'markSold') {
      const ids = Array.from(selectedIds);
      // Hold-to-Pay is a different endpoint entirely — open the review modal, which is
      // its own confirmation step, instead of the batch settlement path.
      if (settlementMode === 'HOLD_INVOICE') {
        openPaymentRequest(ids);
        return;
      }
      // A hold with a payment request already out is settled by the shopper paying it,
      // not by marking it sold again. The server rejects this with a 409 — say so before
      // the round trip so the organizer gets an answer, not an error.
      if (holds.filter((h) => ids.includes(h.id)).some(hasInvoice)) {
        showToast('One of these holds already has a payment request out. Cancel it first, or wait for the shopper to pay.', 'error');
        return;
      }
      // Every other settlement mode goes through a confirmation first. RECORD writes a
      // PAID Purchase row and decrements stock the moment it runs, and AUTO can resolve
      // to RECORD server-side, so neither may fire from a single unguarded click.
      setPendingSettlement({ ids, mode: settlementMode, isTestTransaction: settlementMode === 'RECORD' && isTestTransaction });
      return;
    }
    batchMutation.mutate({ ids: Array.from(selectedIds), action });
  };

  // Copy for the confirmation dialog, per settlement mode.
  const buildSettlementConfirm = (ids: string[], mode: SettlementChoice) => {
    const chosen = holds.filter((h) => ids.includes(h.id));
    const count = chosen.length || ids.length;
    const plural = count === 1 ? '' : 's';
    const total = chosen.reduce((sum, h) => sum + (h.item.price ?? 0), 0);
    const money = `$${total.toFixed(2)}`;
    // Client-side estimate for the confirmation copy only. The server computes and accrues the
    // real number (services/cashFeeService.ts) and returns it, which is what the success toast
    // below reports — this is never used as the charged amount.
    const commissionMoney = (amount: number) => `$${(amount * commissionRate).toFixed(2)}`;
    switch (mode) {
      case 'RECORD':
        return {
          title: 'Record a cash sale?',
          message: `This marks ${count} item${plural} sold and records a cash sale of ${money}. You keep the ${money} in cash. Your ${commissionLabel} commission on it — ${commissionMoney(total)} — is added to your fee balance and comes out of your next payout. Your stock goes down, the shopper is notified, and it cannot be undone from this page.`,
          confirmLabel: 'Record cash sale',
          variant: 'danger' as const,
        };
      case 'POS_CART':
        return {
          title: `Add ${count} item${plural} to your POS cart?`,
          message: `Nothing is charged yet. The item${plural} move into your POS cart and you finish at checkout.`,
          confirmLabel: 'Add to cart',
          variant: 'default' as const,
        };
      case 'CHECKOUT_LINK':
        return {
          title: 'Send a checkout link?',
          message: `This creates a ${money} payment link for ${count} item${plural} and sends it to the shopper. Nothing is charged until they pay.`,
          confirmLabel: 'Create link',
          variant: 'default' as const,
        };
      default:
        return {
          title: `Mark ${count} item${plural} sold?`,
          message: `We settle ${count} item${plural} (${money}) the way that fits this sale. If that is a cash sale it is recorded right away, your stock goes down, your ${commissionLabel} commission (${commissionMoney(total)}) is billed against your next payout, and it cannot be undone from this page.`,
          confirmLabel: 'Mark Sold',
          variant: 'danger' as const,
        };
    }
  };

  const toggleBuyerExpand = (buyerId: string) => {
    setExpandedBuyers((prev) => {
      const next = new Set(prev);
      next.has(buyerId) ? next.delete(buyerId) : next.add(buyerId);
      return next;
    });
  };

  // Auto-expand all on first load
  const allExpanded = expandedBuyers.size === 0 && holds.length > 0;

  return (
    <>
      <Head>
        <title>Active Holds - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-8">
          {/* Error banner */}
          {(holdsError || salesError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 mb-6 text-sm text-red-700 dark:text-red-400">
              Something went wrong loading your holds. Please refresh to try again.
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Link href="/organizer/dashboard" className="text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400 text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100">
              Active Holds {holds.length > 0 && <span className="text-lg font-normal text-warm-500 dark:text-warm-400">({holds.length})</span>}
            </h1>
          </div>

          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-4 mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            {/* Sale filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="sale-filter" className="text-sm font-medium text-warm-700 dark:text-warm-300">Sale:</label>
              <select
                id="sale-filter"
                value={saleFilter}
                onChange={(e) => { setSaleFilter(e.target.value); setSelectedIds(new Set()); }}
                className="text-sm border border-warm-300 dark:border-gray-700 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="all">All sales</option>
                {salesData?.map((sale) => (
                  <option key={sale.id} value={sale.id}>{sale.title}</option>
                ))}
              </select>
            </div>

            {/* Sort toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-warm-700 dark:text-warm-300">Sort:</span>
              <button
                onClick={() => setSortBy('expiry')}
                className={`text-sm px-3 py-1 rounded-md transition-colors ${
                  sortBy === 'expiry'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 font-semibold'
                    : 'text-warm-600 dark:text-warm-400 hover:bg-warm-100 dark:hover:bg-gray-700'
                }`}
              >
                Expiring Soon
              </button>
              <button
                onClick={() => setSortBy('created')}
                className={`text-sm px-3 py-1 rounded-md transition-colors ${
                  sortBy === 'created'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 font-semibold'
                    : 'text-warm-600 dark:text-warm-400 hover:bg-warm-100 dark:hover:bg-gray-700'
                }`}
              >
                Recently Added
              </button>
            </div>

            {/* Select all */}
            {holds.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={toggleSelectAll}
                  className="text-sm text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400 font-medium"
                >
                  {selectedIds.size === holds.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            )}
          </div>

          {/* Batch action bar */}
          {selectedIds.size > 0 && (
            <div className="relative z-50 flex flex-wrap items-center gap-3 mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <span className="text-sm font-medium text-amber-800 dark:text-amber-400">{selectedIds.size} selected</span>
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => handleBatch('release')}
                  disabled={batchMutation.isPending}
                  className="text-sm bg-white dark:bg-warm-800 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-4 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                >
                  Release
                </button>
                <button
                  onClick={() => handleBatch('extend')}
                  disabled={batchMutation.isPending}
                  className="text-sm bg-white dark:bg-warm-800 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-4 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                >
                  Extend
                </button>
                <select
                  value={settlementMode}
                  onChange={(e) => {
                    const next = e.target.value as SettlementChoice;
                    setSettlementMode(next);
                    if (next !== 'RECORD') setIsTestTransaction(false);
                  }}
                  disabled={batchMutation.isPending}
                  title="How to settle these items when marked sold"
                  aria-label="Settlement method"
                  className="text-sm bg-white dark:bg-warm-800 border border-warm-300 dark:border-warm-600 text-warm-700 dark:text-warm-200 px-2 py-1.5 rounded-md disabled:opacity-50"
                >
                  <option value="AUTO">Auto (recommended)</option>
                  <option value="RECORD">Record cash sale</option>
                  <option value="POS_CART">Add to POS cart</option>
                  <option value="CHECKOUT_LINK">Send checkout link</option>
                  <option value="HOLD_INVOICE">Email an invoice to the shopper</option>
                </select>
                <button
                  onClick={() => handleBatch('markSold')}
                  disabled={batchMutation.isPending}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                >
                  Mark Sold
                </button>
              </div>
              <p className="basis-full text-xs text-amber-700 dark:text-amber-400 mt-1">
                {SETTLEMENT_HELP[settlementMode]}
              </p>
              {/* Test Transaction safety net UI (2026-08-29): only RECORD is wired
                  server-side (reservationController's markSold/RECORD branch) to accept
                  isTestTransaction, so the toggle is scoped to that mode only. */}
              {settlementMode === 'RECORD' && (
                <label className="basis-full flex items-center gap-2 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTestTransaction}
                    onChange={(e) => setIsTestTransaction(e.target.checked)}
                    className="w-4 h-4 accent-amber-600"
                  />
                  <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    🧪 Test transaction — no real inventory or fee
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Content */}
          {holdsLoading ? (
            <p className="text-warm-600 dark:text-warm-400">Loading holds…</p>
          ) : holds.length === 0 ? (
            <EmptyState
              icon="🤝"
              heading="No active holds"
              subtext="When shoppers reserve items from your sales, their holds will appear here. You'll be able to approve, extend, or release them."
            />
          ) : (
            <div className="space-y-4">
              {groupedByBuyer.map((group) => {
                const buyerKey = group.holds[0].user.id;
                const isExpanded = allExpanded || expandedBuyers.has(buyerKey);

                return (
                  <div key={buyerKey} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                    {/* Buyer header (accordion toggle) */}
                    <button
                      onClick={() => toggleBuyerExpand(buyerKey)}
                      className="w-full flex items-center justify-between px-5 py-3 bg-warm-50 dark:bg-gray-700 hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-warm-900 dark:text-warm-100 font-semibold">{group.buyerName}</span>
                        <span className="text-warm-400 dark:text-warm-500 text-sm">{group.buyerEmail}</span>
                        {typeof group.holds[0].user.fraudConfidenceScore === 'number' && (
                          <FraudBadge confidenceScore={group.holds[0].user.fraudConfidenceScore} size="sm" />
                        )}
                        {/* Rank badge */}
                        {group.holds[0].user.explorerRank && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-warm-900 dark:text-warm-100">
                              {getRankBadge(group.holds[0].user.explorerRank).emoji}{' '}
                              {getRankBadge(group.holds[0].user.explorerRank).label}
                            </span>
                            {group.holds[0].user.explorerRank === 'GRANDMASTER' && (
                              <span className="text-xs text-warm-500 dark:text-warm-400">
                                {getRankBadge(group.holds[0].user.explorerRank).description}
                              </span>
                            )}
                          </div>
                        )}
                        <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                          {group.holds.length} {group.holds.length === 1 ? 'hold' : 'holds'}
                        </span>
                      </div>
                      <svg
                        className={`h-5 w-5 text-warm-400 dark:text-warm-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Hold items */}
                    {isExpanded && (
                      <div className="divide-y divide-warm-100 dark:divide-gray-700">
                        {group.holds.map((hold) => (
                          <div key={hold.id} className="flex items-start gap-4 px-5 py-4">
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={selectedIds.has(hold.id)}
                              onChange={() => toggleSelect(hold.id)}
                              className="mt-1 h-4 w-4 rounded border-warm-300 text-amber-600 focus:ring-amber-500"
                            />

                            {/* Item thumbnail */}
                            <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-warm-100 dark:bg-gray-700">
                              {hold.item.photoUrls && hold.item.photoUrls.length > 0 ? (
                                <img
                                  key={hold.item.photoUrls[0]}
                                  src={hold.item.photoUrls[0]}
                                  alt={hold.item.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-warm-400 dark:text-warm-500 text-2xl">📷</div>
                              )}
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <Link
                                    href={`/items/${hold.item.id}`}
                                    className="font-semibold text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 line-clamp-1"
                                  >
                                    {hold.item.title}
                                  </Link>
                                  {hold.item.price != null && (
                                    <span className="ml-2 text-sm font-medium text-green-700">${hold.item.price.toFixed(2)}</span>
                                  )}
                                </div>
                                {/* Single actions */}
                                <div className="flex gap-2 flex-shrink-0">
                                  {hold.status === 'PENDING' && (
                                    <button
                                      onClick={() => updateMutation.mutate({ id: hold.id, status: 'CONFIRMED' })}
                                      disabled={updateMutation.isPending}
                                      title="Approve this hold. Shopper will be notified they can come pick up the item"
                                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      Approve Hold
                                    </button>
                                  )}
                                  <button
                                    onClick={() => batchMutation.mutate({ ids: [hold.id], action: 'extend' })}
                                    disabled={batchMutation.isPending}
                                    title="Add 30 minutes to this hold's expiry"
                                    className="text-xs border border-blue-400 text-blue-600 hover:bg-blue-50 px-3 py-1 rounded disabled:opacity-50"
                                  >
                                    Extend (+30min)
                                  </button>
                                  {hasInvoice(hold) && (
                                    <button
                                      onClick={() => setPendingRelease(hold)}
                                      disabled={releaseInvoiceMutation.isPending}
                                      title="Cancel the payment request you sent this shopper. Their payment link stops working and the item goes back on hold for them."
                                      className="text-xs border border-blue-400 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1 rounded disabled:opacity-50"
                                    >
                                      {releaseInvoiceMutation.isPending ? 'Cancelling...' : 'Cancel payment request'}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => updateMutation.mutate({ id: hold.id, status: 'CANCELLED' })}
                                    disabled={updateMutation.isPending}
                                    title="Cancel this hold. Item becomes available again for other shoppers"
                                    className="text-xs border border-red-400 text-red-600 hover:bg-red-50 px-3 py-1 rounded disabled:opacity-50"
                                  >
                                    Cancel Hold
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-warm-500 dark:text-warm-400 mt-0.5">{hold.item.sale.title}</p>
                              {/* Whose hold this is. The buyer accordion header carries the
                                  name too, but it scrolls away and can be collapsed -- and the
                                  invoice bundles by shopper, so the card has to say it. */}
                              <p className="text-xs text-warm-600 dark:text-warm-300 mt-0.5">
                                Held by <span className="font-medium text-warm-800 dark:text-warm-100">{hold.user.name}</span>
                                <span className="text-warm-400 dark:text-warm-500"> · {hold.user.email}</span>
                              </p>
                              {hold.note && (
                                <p className="text-xs text-warm-600 dark:text-warm-400 mt-1 italic">"{hold.note}"</p>
                              )}
                              {/* Bundling warning: sending an invoice for this hold also bills
                                  everything else this shopper is holding at this sale. */}
                              {(() => {
                                const bundle = bundlesByKey[bundleKey(hold)] ?? [hold];
                                if (bundle.length < 2) return null;
                                const others = bundle.length - 1;
                                const bundleTotal = bundle.reduce((sum, h) => sum + (h.item.price ?? 0), 0);
                                return (
                                  <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1 mt-1.5">
                                    Invoices together with {others} other item{others === 1 ? '' : 's'} {hold.user.name} is
                                    holding at this sale — {bundle.length} items, ${bundleTotal.toFixed(2)} on one payment request.
                                  </p>
                                );
                              })()}
                              <div className="flex items-center gap-3 mt-2">
                                <span
                                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    hold.status === 'CONFIRMED'
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                      : hold.status === 'HOLD_IN_CART'
                                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  }`}
                                >
                                  {/* HOLD_IN_CART is a POS-cart hold. It now reaches this
                                      page (only when it carries an invoice) so the organizer
                                      has somewhere to cancel a stuck cash request — the raw
                                      enum name is not something to show a human. */}
                                  {hold.status === 'HOLD_IN_CART' ? 'In POS cart' : hold.status}
                                </span>
                                {hasInvoice(hold) && (
                                  <span
                                    title="This shopper has been emailed a payment request for this item."
                                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                  >
                                    Payment requested
                                  </span>
                                )}
                                <HoldTimer
                                  expiresAt={hold.expiresAt}
                                  audience="organizer"
                                  holderName={hold.user.name}
                                />
                                <span className="text-xs text-warm-400 dark:text-warm-500">
                                  Placed {formatDistanceToNow(parseISO(hold.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {/* Mark Sold confirmation (all settlement modes except Hold-to-Pay, which has
          its own review modal). */}
      {pendingSettlement && (() => {
        const copy = buildSettlementConfirm(pendingSettlement.ids, pendingSettlement.mode);
        // Test Transaction safety net UI (2026-08-29): tell the organizer plainly, inside
        // the confirmation copy itself, that this specific confirm click will NOT move real
        // inventory or money -- appended here rather than in ConfirmDialog so the shared
        // component stays untouched.
        const testTxnMessage = pendingSettlement.isTestTransaction
          ? `${copy.message}\n\n🧪 TEST TRANSACTION — stock will not be reduced, no fee will be accrued, and the shopper will not be notified.`
          : copy.message;
        return (
          <ConfirmDialog
            isOpen
            title={pendingSettlement.isTestTransaction ? `🧪 TEST — ${copy.title}` : copy.title}
            message={testTxnMessage}
            confirmLabel={copy.confirmLabel}
            cancelLabel="Not yet"
            variant={copy.variant}
            onCancel={() => setPendingSettlement(null)}
            onConfirm={() => {
              const { ids, mode, isTestTransaction: testTxn } = pendingSettlement;
              setPendingSettlement(null);
              setIsTestTransaction(false);
              batchMutation.mutate({ ids, action: 'markSold', settlementMode: mode, isTestTransaction: testTxn });
            }}
          />
        );
      })()}

      {/* Cancel-payment-request confirmation (#221 reclaim path). Voiding a live payment
          link the shopper may be looking at right now is not a one-click action. */}
      {pendingRelease && (() => {
        const bundle = bundlesByKey[bundleKey(pendingRelease)] ?? [pendingRelease];
        const invoiced = bundle.filter(hasInvoice);
        const count = invoiced.length || 1;
        return (
          <ConfirmDialog
            isOpen
            title="Cancel this payment request?"
            message={
              count > 1
                ? `${pendingRelease.user.name}'s payment link for ${count} items will stop working. The items stay on hold for them, and you can send a new request afterwards.`
                : `${pendingRelease.user.name}'s payment link for "${pendingRelease.item.title}" will stop working. The item stays on hold for them, and you can send a new request afterwards.`
            }
            confirmLabel="Cancel the request"
            cancelLabel="Leave it active"
            variant="danger"
            onCancel={() => setPendingRelease(null)}
            onConfirm={() => {
              const target = pendingRelease;
              setPendingRelease(null);
              releaseInvoiceMutation.mutate(target.id);
            }}
          />
        );
      })()}

      {/* Hold-to-Pay Modal (#221) */}
      {showPayModal && payModalHold && (() => {
        // The server bundles EVERY hold this shopper has at this sale into one invoice
        // (markSoldAndCreateInvoice), so the modal has to show the bundle, not just the
        // hold that was clicked — otherwise the organizer approves one price and the
        // shopper is billed another. Mirror the server's bundling rule exactly:
        // same shopper + same sale + still on the holds list (PENDING/CONFIRMED).
        const anchor = payModalHold;
        const bundle = holds.filter(
          (h) => h.user.id === anchor.user.id && h.item.sale.id === anchor.item.sale.id
        );
        const isBundle = bundle.length > 1;
        const bundleTotal = bundle.reduce((sum, h) => sum + (h.item.price ?? 0), 0);
        // Payment window = the earliest hold expiry in the bundle (LOCKED DECISION #7).
        const earliestExpiry = new Date(
          Math.min(...bundle.map((h) => new Date(h.expiresAt).getTime()))
        ).toISOString();

        return (
          <HoldToPayModal
            // POST /reservations/:id/mark-sold keys on the RESERVATION id, not the item id.
            itemId={anchor.id}
            itemTitle={
              isBundle
                ? `${bundle.length} items from ${anchor.item.sale.title}`
                : anchor.item.title
            }
            itemPrice={isBundle ? bundleTotal : (anchor.item.price ?? 0)}
            itemPhoto={isBundle ? undefined : anchor.item.photoUrls?.[0]}
            // Itemised so the organizer sees exactly which items are on the one invoice.
            bundleItems={bundle.map((h) => ({
              id: h.id,
              title: h.item.title,
              price: h.item.price ?? 0,
              photoUrl: h.item.photoUrls?.[0],
            }))}
            shopperId={anchor.user.id}
            shopperName={anchor.user.name}
            shopperEmail={anchor.user.email}
            organizerTier={(user?.organizerTier as 'SIMPLE' | 'PRO' | 'TEAMS') ?? 'SIMPLE'}
            expiresAt={earliestExpiry}
            isOpen={showPayModal}
            onClose={() => {
              setShowPayModal(false);
              setPayModalHold(null);
            }}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['organizer-holds'] });
              setSelectedIds(new Set());
              setShowPayModal(false);
              setPayModalHold(null);
            }}
          />
        );
      })()}
    </>
  );
};

export default OrganizerHoldsPage;
