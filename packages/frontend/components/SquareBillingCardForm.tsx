import React, { useEffect, useRef, useState } from 'react';

interface SquareBillingCardFormProps {
  onTokenized: (sourceId: string) => void;
  onError?: (error: string) => void;
  submitLabel: string;
  isProcessing?: boolean;
}

declare global {
  interface Window {
    Square?: any;
  }
}

// Square Plan B recurring billing (2026-09-13) -- card-on-file capture for PRO/TEAMS
// organizer subscriptions and Hunt Pass. Sibling to components/SquarePaymentRequestForm.tsx
// (POS) and BoostPurchaseModal.tsx (boost cash rail) -- same Web Payments SDK
// load/tokenize pattern, all three targeting FindA.Sale's OWN platform Square
// application+location (NEXT_PUBLIC_SQUARE_APPLICATION_ID / NEXT_PUBLIC_SQUARE_PLATFORM_
// LOCATION_ID), since billing charges run against the platform account, never an
// organizer's own connected Square account. Unlike SquarePaymentRequestForm (which charges
// an exact amount right away), this form only TOKENIZES a card -- the caller decides
// whether/when to actually charge it (a deferred trial-end charge for organizer billing,
// or an immediate first charge for Hunt Pass) and shows its own price/trial copy around
// this component rather than this component assuming a "Pay $X now" framing.
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

export const SquareBillingCardForm: React.FC<SquareBillingCardFormProps> = ({
  onTokenized,
  onError,
  submitLabel,
  isProcessing = false,
}) => {
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const applicationId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID;
      const locationId = process.env.NEXT_PUBLIC_SQUARE_PLATFORM_LOCATION_ID;
      if (!applicationId || !locationId) {
        setLoadError('Square billing is not configured for this app yet.');
        return;
      }
      try {
        await loadSquareSdk();
        if (cancelled || !window.Square) return;
        const payments = window.Square.payments(applicationId, locationId);
        const isDarkModeForCard = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
        const cardStyle = isDarkModeForCard
          ? {
              '.input-container': { borderColor: '#4b5563', borderRadius: '8px' },
              '.input-container.is-focus': { borderColor: '#f59e0b' },
              'input': { backgroundColor: '#374151', color: '#f5f5f5', fontSize: '16px' },
              'input::placeholder': { color: '#9ca3af' },
            }
          : {
              '.input-container': { borderColor: '#e5e7eb', borderRadius: '8px' },
              '.input-container.is-focus': { borderColor: '#f59e0b' },
              'input': { backgroundColor: '#ffffff', color: '#1a1a1a', fontSize: '16px' },
              'input::placeholder': { color: '#9ca3af' },
            };
        const card = await payments.card({ style: cardStyle });
        if (cancelled) return;
        if (cardContainerRef.current) {
          await card.attach(cardContainerRef.current);
        }
        cardRef.current = card;
        setIsReady(true);
      } catch (err: any) {
        console.error('[SquareBillingCardForm] Failed to init Square Web Payments SDK:', err);
        if (!cancelled) setLoadError('Could not load the payment form. Please refresh and try again.');
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
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardRef.current) {
      onError?.('Card form not ready yet');
      return;
    }
    setIsSubmitting(true);

    const timeoutId = setTimeout(() => {
      setIsSubmitting(false);
      onError?.('Payment timed out. Please try again.');
    }, 60000);

    try {
      const result = await cardRef.current.tokenize();
      clearTimeout(timeoutId);
      if (result.status === 'OK' && result.token) {
        onTokenized(result.token);
      } else {
        const detail = Array.isArray(result.errors)
          ? result.errors.map((err: any) => err.message).filter(Boolean).join(', ')
          : undefined;
        onError?.(detail || `Card entry failed (status: ${result.status})`);
        setIsSubmitting(false);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('[SquareBillingCardForm] tokenize error:', err);
      onError?.(err.message || 'Payment processing failed');
      setIsSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/30">
        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
      </div>
    );
  }

  const isDisabled = isSubmitting || isProcessing || !isReady;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Card Details
        </label>
        <div ref={cardContainerRef} />
        {!isReady && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Loading card form…</p>}
      </div>

      <button
        type="submit"
        disabled={isDisabled}
        className="w-full bg-sage-600 hover:bg-sage-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
      >
        {isSubmitting || isProcessing ? 'Processing…' : submitLabel}
      </button>
    </form>
  );
};

export default SquareBillingCardForm;
