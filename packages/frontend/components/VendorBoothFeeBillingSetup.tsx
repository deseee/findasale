/**
 * VendorBoothFeeBillingSetup -- ADR-090 Phase 4 (S-hubs-followup), Square path (2026-09-14,
 * claude_docs/feature-notes/booth-rent-autopay-square-design-2026-09-13.md §7). Lets a
 * vendor save a card on file so their booth's flat, recurring boothFee (rent) can actually
 * be billed by vendorBoothFeeBillingCron.ts.
 *
 * Square path replaces the old Stripe Elements CardElement + confirmCardSetup SetupIntent
 * flow (permanently dead -- Stripe's platform account closed 2026-09-12) with Square's Web
 * Payments SDK, following components/SquarePaymentRequestForm.tsx's exact technical pattern
 * (lazy-load square.js/sandbox square.js per NEXT_PUBLIC_SQUARE_ENVIRONMENT,
 * window.Square.payments(applicationId, locationId), dark-mode-aware cardStyle,
 * card.tokenize() -> sourceId) -- duplicated here rather than imported, since that
 * component's own copy/button ("Pay $X") is checkout-specific and does not fit a
 * save-a-card-for-later action; the small SDK-loading/init logic is the only part shared,
 * and this codebase already accepts this class of small duplication elsewhere (see
 * squareVendorBoothCartService.ts's own "accepted clutter" comment).
 *
 * Unlike Stripe's SetupIntent (create -> client confirms -> server re-verifies), Square's
 * SDK produces a sourceId directly, client-side -- there is no server-issued secret to
 * round-trip, so this is a single POST to .../fee-billing/square-setup with { sourceId },
 * not a two-step setup-intent/confirm pair.
 */

import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

interface VendorBoothFeeBillingSetupProps {
  vendorBoothId: string;
  boothFee: string;
  /** The HUB OWNER's own Square location id -- required to initialize the Web Payments SDK
   *  (GET .../fee-billing/status's squareLocationId, only present when the hub owner has
   *  finished connecting Square). */
  squareLocationId: string;
  onConfigured: () => void;
}

declare global {
  interface Window {
    Square?: any;
  }
}

const SQUARE_SDK_SRC_PRODUCTION = 'https://web.squarecdn.com/v1/square.js';
const SQUARE_SDK_SRC_SANDBOX = 'https://sandbox.web.squarecdn.com/v1/square.js';

function loadSquareSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Square SDK requires a browser'));
  if (window.Square) return Promise.resolve();

  const isSandbox = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'sandbox';
  const src = isSandbox ? SQUARE_SDK_SRC_SANDBOX : SQUARE_SDK_SRC_PRODUCTION;

  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Square SDK')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Square SDK'));
    document.head.appendChild(script);
  });
}

type SetupState = 'loading' | 'idle' | 'processing' | 'error';

export default function VendorBoothFeeBillingSetup({
  vendorBoothId,
  boothFee,
  squareLocationId,
  onConfigured,
}: VendorBoothFeeBillingSetupProps) {
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<any>(null);

  const [state, setState] = useState<SetupState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const applicationId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID;
      if (!applicationId) {
        setErrorMessage('Square is not configured for this app.');
        setState('error');
        return;
      }
      try {
        await loadSquareSdk();
        if (cancelled || !window.Square) return;
        const payments = window.Square.payments(applicationId, squareLocationId);
        // Dark-mode-aware Square Web Payments SDK card styling -- same fixed selector set
        // Square's style API supports (developer.squareup.com/docs/web-payments/customize-styles),
        // same values SquarePaymentRequestForm.tsx already uses (S-dark-mode-audit).
        const isDarkModeForCard =
          typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
        const cardStyle = isDarkModeForCard
          ? {
              '.input-container': { borderColor: '#4b5563', borderRadius: '8px' },
              '.input-container.is-focus': { borderColor: '#f59e0b' },
              input: { backgroundColor: '#374151', color: '#f5f5f5', fontSize: '16px' },
              'input::placeholder': { color: '#9ca3af' },
            }
          : {
              '.input-container': { borderColor: '#e5e7eb', borderRadius: '8px' },
              '.input-container.is-focus': { borderColor: '#f59e0b' },
              input: { backgroundColor: '#ffffff', color: '#1a1a1a', fontSize: '16px' },
              'input::placeholder': { color: '#9ca3af' },
            };
        const card = await payments.card({ style: cardStyle });
        if (cancelled) return;
        if (cardContainerRef.current) {
          await card.attach(cardContainerRef.current);
        }
        cardRef.current = card;
        setState('idle');
      } catch (err: any) {
        console.error('[VendorBoothFeeBillingSetup] Failed to init Square Web Payments SDK:', err);
        if (!cancelled) {
          setErrorMessage('Could not load the card form. Please refresh and try again.');
          setState('error');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (cardRef.current) {
        Promise.resolve(cardRef.current.destroy?.()).catch(() => {});
        cardRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squareLocationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardRef.current) return;

    setState('processing');
    setErrorMessage('');

    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== 'OK' || !result.token) {
        const detail = Array.isArray(result.errors)
          ? result.errors.map((err: any) => err.message).filter(Boolean).join(', ')
          : undefined;
        throw new Error(detail || `Card entry failed (status: ${result.status})`);
      }

      await api.post(`/vendor-booth/${vendorBoothId}/fee-billing/square-setup`, {
        sourceId: result.token,
      });

      onConfigured();
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.error || err?.message || 'Failed to save card');
      setState('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-warm-600 dark:text-warm-400">
        Save a card to auto-pay your ${Number(boothFee).toFixed(2)}/month booth rent. Billed
        automatically each month -- no manual payment needed.
      </p>
      <div className="p-3 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900">
        <div ref={cardContainerRef} />
        {state === 'loading' && (
          <p className="text-sm text-warm-500 dark:text-warm-400 mt-2">Loading card form...</p>
        )}
      </div>
      {state === 'error' && errorMessage && (
        <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
      <button
        type="submit"
        disabled={state === 'loading' || state === 'processing'}
        className="w-full bg-sage-600 hover:bg-sage-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg transition-colors"
      >
        {state === 'processing' ? 'Saving card...' : 'Save Card for Auto-Pay'}
      </button>
    </form>
  );
}
