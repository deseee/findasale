/**
 * HoldInvoiceStatusCard Component
 * For shoppers viewing item detail page.
 * Shows when item status = INVOICE_ISSUED and user is the shopper with the active hold.
 * Displays countdown timer and "Complete Payment" CTA.
 */

import HoldTimer from './HoldTimer';

interface HoldInvoiceStatusCardProps {
  itemId: string;
  itemPrice: number;
  checkoutUrl: string;
  expiresAt: string;
  organizerName: string;
}

export default function HoldInvoiceStatusCard({
  itemId,
  itemPrice,
  checkoutUrl,
  expiresAt,
  organizerName,
}: HoldInvoiceStatusCardProps) {
  const handleCheckout = () => {
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank');
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-4">
      {/* Status Badge & Info */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-block px-2 py-1 bg-amber-200 dark:bg-amber-700 text-amber-900 dark:text-amber-100 text-xs font-bold rounded">
          PAYMENT REQUESTED
        </span>
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Complete your purchase from <strong>{organizerName}</strong>
        </p>
      </div>

      {/* Amount */}
      <div className="mb-3">
        <p className="text-sm text-amber-700 dark:text-amber-400">Amount Due</p>
        <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">
          ${itemPrice.toFixed(2)}
        </p>
      </div>

      {/* Timer */}
      <div className="mb-4">
        <HoldTimer expiresAt={expiresAt} />
      </div>

      {/* CTA */}
      <button
        onClick={handleCheckout}
        className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
      >
        Complete Payment →
      </button>
    </div>
  );
}
