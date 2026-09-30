import React, { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import AccessibleModal from './AccessibleModal';

interface SaleTextUpdatesOptInProps {
  saleId: string;
  saleTitle?: string;
}

interface SubscriptionRow {
  saleId: string;
  phone?: string | null;
  smsConsentAt?: string | null;
  /** Set when a number was submitted but not yet confirmed by replying YES (valid for 48 hours). */
  smsConsentPendingAt?: string | null;
}

const PENDING_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Shopper opt-in for text (SMS) updates about one sale.
 *
 * This is the ONLY place consent for organizer text updates is captured, and it is a double opt-in
 * (2026-09-29): submitting a number calls POST /notifications/subscribe with smsConsent: true, which stores
 * it as PENDING and sends ONE confirmation text. Updates start only after the owner of that number replies
 * YES (an unconfirmed number is never texted, and expires after 48 hours). Organizers on PRO or TEAMS can then
 * text confirmed shoppers from /organizer/send-update; replying STOP to any text removes the number from every
 * organizer's sends (see backend smsComplianceService).
 * Turning texts off here clears the number and the consent record.
 * Signed-in shoppers only (matches the Remind Me button); signed-out visitors keep the no-login email alert.
 */
const SaleTextUpdatesOptIn: React.FC<SaleTextUpdatesOptInProps> = ({ saleId, saleTitle = 'this sale' }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True right after a submit, even if the server could not keep the number (the reply is deliberately the
  // same either way), so the shopper always lands on the "check your phone" screen.
  const [justSubmitted, setJustSubmitted] = useState(false);

  const textsOn = !!sub?.phone && !!sub?.smsConsentAt;
  const pendingAt = sub?.smsConsentPendingAt ? new Date(sub.smsConsentPendingAt).getTime() : 0;
  const pendingFromServer = !!sub?.phone && !sub?.smsConsentAt && pendingAt > 0 && Date.now() - pendingAt < PENDING_WINDOW_MS;
  const awaitingConfirmation = !textsOn && (pendingFromServer || justSubmitted);

  const loadSubscription = useCallback(async () => {
    try {
      const res = await api.get('/notifications/subscriptions');
      const rows: SubscriptionRow[] = Array.isArray(res.data) ? res.data : [];
      setSub(rows.find((r) => r.saleId === saleId) ?? null);
    } catch {
      setSub(null);
    }
  }, [saleId]);

  useEffect(() => {
    if (user && saleId) loadSubscription();
  }, [user, saleId, loadSubscription]);

  if (!user) return null;

  const openModal = () => {
    setError(null);
    setAgreed(false);
    setPhone('');
    setJustSubmitted(false);
    setIsOpen(true);
  };

  const handleTurnOn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError('Enter your mobile number.');
      return;
    }
    if (!agreed) {
      setError('Please check the box to agree to text messages.');
      return;
    }
    setIsSaving(true);
    try {
      await api.post('/notifications/subscribe', { saleId, phone: phone.trim(), smsConsent: true });
      await loadSubscription();
      // Not on yet: the shopper still has to reply YES to the confirmation text.
      setJustSubmitted(true);
      showToast('Check your phone to confirm text updates', 'success');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not turn on text updates. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTurnOff = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await api.post('/notifications/subscribe', { saleId, phone: null });
      await loadSubscription();
      setJustSubmitted(false);
      showToast('Text updates are off for this sale', 'success');
      setIsOpen(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not turn off text updates. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const last4 = sub?.phone ? sub.phone.replace(/\D/g, '').slice(-4) : '';

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="px-3 py-1 rounded text-sm font-semibold bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60 transition"
      >
        {textsOn ? `Text updates on (ending ${last4})` : awaitingConfirmation ? 'Confirm text updates' : 'Get text updates'}
      </button>

      <AccessibleModal isOpen={isOpen} onClose={() => setIsOpen(false)} ariaLabelledBy="sale-text-updates-title">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 id="sale-text-updates-title" className="text-xl font-bold text-warm-900 dark:text-warm-100">
              Text updates
            </h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-warm-500 hover:text-warm-700 dark:text-warm-400 dark:hover:text-warm-200 text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {textsOn ? (
            <div>
              <p className="text-sm text-warm-700 dark:text-warm-300 mb-4">
                You will get text updates about {saleTitle} at the number ending in {last4}. Reply STOP to any text to stop them everywhere.
              </p>
              {error && (
                <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={handleTurnOff}
                disabled={isSaving}
                className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded font-medium disabled:opacity-50"
              >
                {isSaving ? 'Turning off...' : 'Turn off text updates'}
              </button>
            </div>
          ) : awaitingConfirmation ? (
            <div>
              <h3 className="text-base font-semibold text-warm-900 dark:text-warm-100 mb-2">Check your phone</h3>
              <p className="text-sm text-warm-700 dark:text-warm-300 mb-3">
                {last4
                  ? `If the number ending in ${last4} can receive texts, we just sent it one text.`
                  : 'If that number can receive texts, we just sent it one text.'}{' '}
                Reply <strong>YES</strong> to that text to turn on updates about {saleTitle}. You will not get any
                updates until you do, and the request expires after 48 hours.
              </p>
              <p className="text-xs text-warm-600 dark:text-warm-400 mb-4">
                No text? If you ever replied STOP to our number, text START to it first, then try again.
              </p>
              {error && (
                <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={handleTurnOff}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded font-medium disabled:opacity-50"
                >
                  {isSaving ? 'Cancelling...' : 'Cancel or change number'}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleTurnOn} noValidate>
              <p className="text-sm text-warm-700 dark:text-warm-300 mb-2">
                Get a text if the organizer of {saleTitle} sends an update, like a new start time or a change of plans.
              </p>
              <p className="text-sm text-warm-700 dark:text-warm-300 mb-4">
                We will text you <strong>once</strong> to confirm. Reply YES to that text to turn updates on.
              </p>
              <label htmlFor="sale-text-phone" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1">
                Mobile number
              </label>
              <input
                id="sale-text-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-700 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 mb-4"
              />
              <label className="flex items-start gap-3 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-amber-600 rounded focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-xs text-warm-600 dark:text-warm-400 leading-relaxed">
                  I agree to receive recurring text messages about {saleTitle} from FindA.Sale on behalf of the
                  sale&apos;s organizer at this number, after I confirm by replying YES to a confirmation text.
                  I confirm this is my number. Consent is not a condition of attending or buying. Message
                  frequency varies. Message and data rates may apply. Reply STOP to cancel, HELP for help. See our{' '}
                  <a href="/terms" className="underline text-amber-700 dark:text-amber-400">Terms</a> and{' '}
                  <a href="/privacy" className="underline text-amber-700 dark:text-amber-400">Privacy Policy</a>.
                </span>
              </label>
              {error && (
                <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium disabled:opacity-50"
              >
                {isSaving ? 'Sending confirmation...' : 'Text me a confirmation'}
              </button>
            </form>
          )}
        </div>
      </AccessibleModal>
    </>
  );
};

export default SaleTextUpdatesOptIn;
