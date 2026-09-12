/**
 * BoostPurchaseModal: XP-based boost purchase UI
 *
 * Usage:
 *   <BoostPurchaseModal
 *     boostType="SALE_BUMP"
 *     targetType="SALE"
 *     targetId={saleId}
 *     onClose={() => setShowBoostModal(false)}
 *     onSuccess={() => refetch()}
 *   />
 */

import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import AccessibleModal from './AccessibleModal';

// Stripe cash-rail removed entirely (2026-09-12, Patrick-approved Stripe-removal pass).
// It was already disabled (ENABLE_BOOST_CASH_RAIL = false, audit sweep 2026-09-10) because
// it called boostService.ts's STRIPE rail against FindA.Sale's permanently-closed Stripe
// platform account -- guaranteed to fail. No Square equivalent exists for boost purchases
// (backend boostController.ts/boostService.ts only ever supported 'XP' | 'STRIPE'; those are
// excluded-29 backend files, left untouched by this pass). Boosts are XP-only until/unless a
// real-money boost rail is scoped as its own feature on Square.

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoostQuote {
  boostType: string;
  xpCost: number;
  durationDays: number;
  label: string;
  description: string;
  userXpBalance: number;
  canAffordXp: boolean;
}

interface BoostPurchaseModalProps {
  boostType: string;
  targetType?: string;
  targetId?: string;
  durationDays?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function BoostPurchaseModal({
  boostType,
  targetType,
  targetId,
  durationDays,
  onClose,
  onSuccess,
}: BoostPurchaseModalProps) {
  const { showToast } = useToast();
  const [quote, setQuote] = useState<BoostQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [undoSeconds, setUndoSeconds] = useState(300); // 5-min undo window
  const [error, setError] = useState<string | null>(null);

  // Fetch quote on mount
  useEffect(() => {
    const fetchQuote = async () => {
      setLoading(true);
      try {
        const res = await api.post('/boosts/quote', { boostType, durationDays });
        const q: BoostQuote = res.data;
        setQuote(q);
      } catch (err: unknown) {
        setError('Unable to load boost pricing. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchQuote();
  }, [boostType, durationDays]);

  // 5-min undo countdown after success
  useEffect(() => {
    if (!success) return;
    if (undoSeconds <= 0) return;
    const t = setInterval(() => setUndoSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [success, undoSeconds]);

  const handleXpPurchase = async () => {
    if (!quote) return;
    setPurchasing(true);
    setError(null);
    try {
      await api.post('/boosts/purchase', {
        boostType,
        targetType,
        targetId,
        paymentMethod: 'XP',
        durationDays,
      });
      setSuccess(true);
      showToast(`${quote.label} activated! −${quote.xpCost} XP`, 'success');
      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Purchase failed. Please try again.';
      setError(msg);
    } finally {
      setPurchasing(false);
    }
  };

  const formatSeconds = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <AccessibleModal
      isOpen={true}
      onClose={onClose}
      ariaLabelledBy="boost-purchase-modal-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 id="boost-purchase-modal-title" className="text-lg font-bold text-gray-900 dark:text-warm-100">
            {loading ? 'Loading…' : quote?.label ?? 'Boost'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading pricing…</div>
        )}

        {/* Error */}
        {error && !loading && (
          <div id="boost-purchase-error" role="alert" className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {/* Success state */}
        {success && (
          <div className="text-center py-4">
            <div className="text-4xl mb-2">🚀</div>
            <p className="font-semibold text-gray-900 dark:text-warm-100 mb-1">Boost activated!</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{quote?.description}</p>
            {undoSeconds > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Undo available for {formatSeconds(undoSeconds)}
              </p>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Pricing + purchase UI */}
        {!loading && !success && quote && (
          <div className="space-y-4">
            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-gray-400">{quote.description}</p>

            {/* XP cost display */}
            <div className="p-3 rounded-lg border border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-center">
              <div className="text-lg font-bold">{quote.xpCost} XP</div>
              {!quote.canAffordXp && (
                <div className="text-xs mt-0.5">Need {quote.xpCost - quote.userXpBalance} more</div>
              )}
              {quote.canAffordXp && (
                <div className="text-xs mt-0.5 text-gray-400 dark:text-gray-500">
                  Balance: {quote.userXpBalance} XP
                </div>
              )}
            </div>

            {/* XP confirm */}
            <button
              onClick={handleXpPurchase}
              disabled={purchasing || !quote.canAffordXp}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              {purchasing ? 'Activating…' : `Spend ${quote.xpCost} XP`}
            </button>

            {/* Transparency */}
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">
              XP cannot be exchanged for cash. No real-money purchase required to earn XP.
            </p>
          </div>
        )}
      </div>
    </AccessibleModal>
  );
}
