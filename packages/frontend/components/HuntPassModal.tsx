import React, { useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import AccessibleModal from './AccessibleModal';

// Hunt Pass subscription stopgap (audit sweep, 2026-09-10): handleSubscribe below POSTs to
// /streaks/subscribe-huntpass, which unconditionally creates a Stripe Customer + Checkout
// Session (mode: subscription) against FindA.Sale's Stripe platform account
// (acct_1T3kXhLIWHQCHu75) -- permanently closed. Every subscribe attempt is guaranteed to
// 500. This modal is the single shared entry point reached from both StreakWidget.tsx's
// "Upgrade" button and /shopper/hunt-pass.tsx's two "Upgrade to Hunt Pass" buttons, so
// gating it here covers every entry point at once. Mirrors the
// ENABLE_STRIPE_TERMINAL_CARD_READER / ENABLE_BOOTH_FEE_AUTOPAY pattern: state/logic kept
// intact, UI gated off with an honest message, nothing deleted. Do not remove or flip to
// true without Patrick's explicit approval.
const ENABLE_HUNT_PASS_SUBSCRIPTION = false;

interface HuntPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const HuntPassModal = ({ isOpen, onClose }: HuntPassModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { showToast } = useToast();
  const price = 4.99;

  const handleSubscribe = async () => {
    if (!ENABLE_HUNT_PASS_SUBSCRIPTION) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await api.post('/streaks/subscribe-huntpass');
      if (response.data.url) {
        window.location.href = response.data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message ?? 'Could not start Hunt Pass checkout. Please try again.'
      );
      showToast?.('Failed to start checkout. Please try again.', 'error');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="hunt-pass-modal-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 id="hunt-pass-modal-title" className="text-xl font-bold text-warm-900 dark:text-gray-100">Upgrade to Hunt Pass</h2>
          <button
            onClick={onClose}
            className="text-warm-400 hover:text-warm-600 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Benefits */}
        <div className="mb-5 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-3">Hunt Pass Benefits</h3>
          <ul className="space-y-2 text-sm text-warm-700">
            <li className="flex items-start gap-2">
              <span className="text-purple-600 font-bold">✓</span>
              <span>1.5x XP on every action</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-600 font-bold">✓</span>
              <span>Early access to flash deals</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-600 font-bold">✓</span>
              <span>Exclusive Hunt Pass badge</span>
            </li>
          </ul>
        </div>

        {ENABLE_HUNT_PASS_SUBSCRIPTION ? (
          <>
            {/* Price summary */}
            <div className="mb-5 space-y-1 text-sm">
              <div className="flex justify-between text-warm-600">
                <span>Monthly price</span>
                <span>${price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-warm-900 dark:text-warm-100 border-t pt-1 mt-1">
                <span>Recurring charge</span>
                <span>${price.toFixed(2)}/month</span>
              </div>
            </div>

            <p className="text-xs text-warm-500 mb-5">
              You&apos;ll be taken to a secure Stripe checkout page. This is a recurring monthly
              subscription. Cancel anytime from your profile. By subscribing you agree to our{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900 dark:text-warm-100">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-warm-900 dark:text-warm-100">
                Privacy Policy
              </a>.
            </p>

            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {errorMessage}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2 px-4 border border-warm-300 rounded text-warm-700 hover:bg-warm-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={isSubmitting}
                className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Loading...' : 'Subscribe, $4.99/mo'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg border border-warm-200 dark:border-gray-600 text-sm text-warm-600 dark:text-warm-300">
              Hunt Pass isn&apos;t available right now. Check back soon.
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 border border-warm-300 rounded text-warm-700 hover:bg-warm-50"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </AccessibleModal>
  );
};

export default HuntPassModal;
