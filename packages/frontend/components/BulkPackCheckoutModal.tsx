/**
 * BulkPackCheckoutModal (ADR-136 Addendum E, roadmap #659): buy N whole packs of a bulk lot online, for pickup.
 *
 * This is NOT the normal item checkout. It sends { itemId, sourceId, packs, expectedAmount, clientToken } to
 * POST /square-payment/create-payment. The server prices the packs; expectedAmount is only a check that the screen and the
 * server agree to the cent. No shipping, no coupon, and no discount can be chosen here. clientToken is created once per open
 * modal so a double click is one order, not two.
 *
 * Any answer that says the card was charged (charged: true) locks the form: the only thing left to do is close it, so a
 * shopper is never invited to pay a second time.
 */
import React, { useRef, useState } from 'react';
import api from '../lib/api';
import AccessibleModal from './AccessibleModal';
import { useAuth } from './AuthContext';
import { SquarePaymentRequestForm } from './SquarePaymentRequestForm';
import { getAffiliateLinkIdForCheckout } from '../lib/affiliateAttribution';
import {
  BULK_COPY,
  BulkLot,
  MAX_PACKS_PER_LINE,
  describeBulkError,
  formatCentsLabel,
  newPackClientToken,
  packLineText,
  packTotalCents,
  parsePackCountInput,
} from '../lib/bulkLot';

export interface BulkPackCheckoutModalProps {
  itemId: string;
  itemTitle: string;
  lot: BulkLot;
  organizerSquareLocationId?: string | null;
  onClose: () => void;
  /** Called after a paid order is confirmed, so the page can refresh the packs left. */
  onPaid?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BulkPackCheckoutModal: React.FC<BulkPackCheckoutModalProps> = ({ itemId, itemTitle, lot, organizerSquareLocationId, onClose, onPaid }) => {
  const { user } = useAuth();
  const isGuest = !user;
  const tokenRef = useRef<string>('');
  if (!tokenRef.current) tokenRef.current = newPackClientToken();

  const packSize = lot.packSize ?? 0;
  const packCents = lot.packCents ?? 0;
  const maxPacks = Math.max(1, Math.min(MAX_PACKS_PER_LINE, lot.packsAvailable ?? 1));

  const [countText, setCountText] = useState('1');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const [paidMessage, setPaidMessage] = useState<string | null>(null);

  const parsed = parsePackCountInput(countText);
  const packs = parsed !== null && parsed <= maxPacks ? parsed : null;
  const totalCents = packs !== null ? packTotalCents(packs, packCents) : 0;
  const guestOk = !isGuest || (guestName.trim().length > 0 && EMAIL_RE.test(guestEmail.trim()));
  const done = paidMessage !== null || lockedMessage !== null;

  const fingerprint = async (): Promise<string> => {
    try {
      const signals = [navigator.userAgent, `${screen.width}x${screen.height}`, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language];
      return btoa(signals.join('|'));
    } catch {
      return '';
    }
  };

  const handleTokenized = async (sourceId: string) => {
    if (packs === null || submitting || done) return;
    if (!guestOk) {
      setError(BULK_COPY.buyPackGuestNeeded);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const affiliateLinkId = getAffiliateLinkIdForCheckout();
      const deviceFingerprint = isGuest ? await fingerprint() : undefined;
      const res = await api.post('/square-payment/create-payment', {
        itemId,
        sourceId,
        packs,
        expectedAmount: totalCents / 100,
        clientToken: tokenRef.current,
        ...(affiliateLinkId ? { affiliateLinkId } : {}),
        ...(isGuest ? { guestEmail: guestEmail.trim(), guestName: guestName.trim(), deviceFingerprint } : {}),
      });
      if (res.data?.purchaseId) {
        const note = res.data?.code === 'BULK_PACK_DUPLICATE_PAYMENT' && typeof res.data?.message === 'string' ? ` ${res.data.message}` : '';
        setPaidMessage(`${BULK_COPY.buyPackPaid}${note}`);
        if (onPaid) onPaid();
      } else {
        setError(BULK_COPY.errorGeneric);
      }
    } catch (err) {
      const data = (err as { response?: { data?: { charged?: unknown } } })?.response?.data;
      const readable = describeBulkError(err);
      if (data && data.charged === true) {
        // The card was charged. Never invite a second payment.
        setLockedMessage(readable.message);
        if (onPaid) onPaid();
      } else if (readable.code === 'PRICE_CHANGED' || readable.code === 'INSUFFICIENT_STOCK') {
        setError(`${readable.message} ${BULK_COPY.buyPackRefreshNote}`);
      } else {
        setError(readable.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AccessibleModal
      isOpen
      onClose={onClose}
      ariaLabelledBy="bulk-pack-modal-title"
      contentClassName="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 id="bulk-pack-modal-title" className="text-xl font-bold text-warm-900 dark:text-gray-100">
          {BULK_COPY.buyPackHeading}
        </h2>
        <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] text-2xl leading-none text-warm-500 hover:text-warm-700" aria-label={BULK_COPY.buyPackClose}>
          &times;
        </button>
      </div>

      <div className="mb-4 rounded-lg bg-warm-50 p-3 dark:bg-gray-700">
        <p className="break-words font-semibold text-warm-900 dark:text-warm-100">{itemTitle}</p>
        <p className="text-sm text-warm-700 dark:text-warm-300">
          {lot.packLabel || `${packSize} cards`}, {lot.packPriceLabel || formatCentsLabel(packCents)}
        </p>
        <p className="text-sm text-warm-600 dark:text-warm-400">{lot.packsAvailableLabel}</p>
      </div>

      {paidMessage ? (
        <div role="status">
          <p className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">{paidMessage}</p>
          <button type="button" onClick={onClose} className="min-h-[44px] w-full rounded bg-amber-600 px-4 font-semibold text-white hover:bg-amber-700">
            {BULK_COPY.buyPackClose}
          </button>
        </div>
      ) : lockedMessage ? (
        <div role="alert">
          <p className="mb-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{lockedMessage}</p>
          <p className="mb-4 text-sm font-semibold text-warm-900 dark:text-warm-100">{BULK_COPY.buyPackDoNotPayAgain}</p>
          <button type="button" onClick={onClose} className="min-h-[44px] w-full rounded border border-warm-300 px-4 text-warm-700 hover:bg-warm-50 dark:border-gray-600 dark:text-warm-300">
            {BULK_COPY.buyPackClose}
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="bulk-pack-count" className="block text-sm font-medium text-warm-900 dark:text-warm-100">
            {BULK_COPY.buyPackCountLabel}
          </label>
          <input
            id="bulk-pack-count"
            type="text"
            inputMode="numeric"
            value={countText}
            onChange={(e) => setCountText(e.target.value)}
            disabled={submitting}
            aria-invalid={packs === null}
            aria-describedby="bulk-pack-count-help"
            className="mt-1 min-h-[44px] w-24 rounded border border-warm-300 px-3 text-base dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          <p id="bulk-pack-count-help" className={`mt-1 text-xs ${packs === null ? 'text-red-700 dark:text-red-300' : 'text-warm-600 dark:text-warm-400'}`}>
            {packs === null ? `${BULK_COPY.buyPackCountError} Up to ${maxPacks} right now.` : packLineText(packs, packSize)}
          </p>

          <div className="mt-3 flex justify-between border-t border-warm-300 pt-2 text-sm font-bold text-warm-900 dark:border-gray-600 dark:text-warm-100">
            <span>{BULK_COPY.buyPackTotalLabel}</span>
            <span>{packs === null ? '' : formatCentsLabel(totalCents)}</span>
          </div>
          <p className="mt-1 text-xs text-warm-600 dark:text-warm-400">{BULK_COPY.buyPackPickup}</p>

          {isGuest && (
            <div className="mt-3 space-y-2">
              <div>
                <label htmlFor="bulk-pack-guest-name" className="block text-sm font-medium text-warm-900 dark:text-warm-100">{BULK_COPY.buyPackNameLabel}</label>
                <input id="bulk-pack-guest-name" type="text" autoComplete="name" value={guestName} onChange={(e) => setGuestName(e.target.value)} className="mt-1 min-h-[44px] w-full rounded border border-warm-300 px-3 text-base dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              </div>
              <div>
                <label htmlFor="bulk-pack-guest-email" className="block text-sm font-medium text-warm-900 dark:text-warm-100">{BULK_COPY.buyPackEmailLabel}</label>
                <input id="bulk-pack-guest-email" type="email" autoComplete="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className="mt-1 min-h-[44px] w-full rounded border border-warm-300 px-3 text-base dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </div>
          )}

          {packs !== null && guestOk ? (
            <div className="mt-3">
              <SquarePaymentRequestForm
                requestId={itemId}
                totalAmountCents={totalCents}
                squareLocationId={organizerSquareLocationId ?? null}
                onSuccess={handleTokenized}
                onError={setError}
                isProcessing={submitting}
              />
            </div>
          ) : (
            <p className="mt-3 text-xs text-warm-600 dark:text-warm-400">{packs === null ? BULK_COPY.buyPackCountError : BULK_COPY.buyPackGuestNeeded}</p>
          )}

          <button type="button" onClick={onClose} disabled={submitting} className="mt-3 min-h-[44px] w-full rounded border border-warm-300 px-4 text-warm-700 hover:bg-warm-50 disabled:opacity-50 dark:border-gray-600 dark:text-warm-300">
            {BULK_COPY.buyPackCancel}
          </button>
        </>
      )}
    </AccessibleModal>
  );
};

export default BulkPackCheckoutModal;
