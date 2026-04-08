import React, { useState, useEffect } from 'react';

interface SplitPaymentInputProps {
  totalAmountCents: number;
  cashAmountCents: number;
  onCashChange: (cents: number) => void;
}

export default function SplitPaymentInput({
  totalAmountCents,
  cashAmountCents,
  onCashChange,
}: SplitPaymentInputProps) {
  const [cashInputValue, setCashInputValue] = useState('');

  const cardAmountCents = Math.max(0, totalAmountCents - cashAmountCents);
  // Platform fee is 10% flat on the total transaction — card portion must cover it
  const platformFeeCents = Math.round(totalAmountCents * 0.1);
  const totalAmount = totalAmountCents / 100;
  const cardAmount = cardAmountCents / 100;
  const platformFee = platformFeeCents / 100;

  // Sync input field with prop
  useEffect(() => {
    if (cashAmountCents > 0) {
      setCashInputValue((cashAmountCents / 100).toFixed(2));
    }
  }, [cashAmountCents]);

  const handleCashInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCashInputValue(value);

    // Parse as float and convert to cents
    const dollars = parseFloat(value);
    if (!isNaN(dollars) && dollars >= 0) {
      const cents = Math.round(dollars * 100);
      onCashChange(Math.min(cents, totalAmountCents)); // Cap at total
    } else if (value === '' || value === '0') {
      onCashChange(0);
    }
  };

  // Card must be > 0 AND >= platform fee (Stripe: application_fee_amount cannot exceed PI amount)
  const isCardValid = cardAmountCents > 0 && cardAmountCents >= platformFeeCents;
  const isCashValid = cashAmountCents >= 0 && cashAmountCents <= totalAmountCents;

  return (
    <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-sage-200 dark:border-gray-700 shadow-sm mb-4">
      {/* Total amount (locked) */}
      <div className="mb-4 p-3 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600">
        <p className="text-xs font-medium text-warm-600 dark:text-warm-400">Total</p>
        <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
          ${totalAmount.toFixed(2)}
        </p>
      </div>

      {/* Cash amount input */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-2">
          Cash amount
        </label>
        <input
          type="number"
          inputMode="decimal"
          value={cashInputValue}
          onChange={handleCashInputChange}
          placeholder="$0.00"
          min="0"
          max={totalAmount.toFixed(2)}
          step="0.01"
          className={`w-full border rounded-lg px-3 py-3 text-lg bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 ${
            isCashValid
              ? 'border-warm-300 dark:border-gray-600 focus:ring-sage-500'
              : 'border-red-300 dark:border-red-700 focus:ring-red-500'
          }`}
        />
      </div>

      {/* Card amount (auto-calculated) */}
      <div className="mb-4 p-3 rounded-lg bg-sage-50 dark:bg-gray-700 border border-sage-200 dark:border-gray-600">
        <p className="text-xs font-medium text-sage-600 dark:text-sage-400">Card charge</p>
        <div className="flex items-baseline justify-between">
          <p className={`text-2xl font-bold ${isCardValid ? 'text-sage-700 dark:text-sage-400' : 'text-red-600 dark:text-red-400'}`}>
            ${cardAmount.toFixed(2)}
          </p>
          {/* Platform fee is internal — not shown to organizer or shopper */}
        </div>
        {!isCardValid && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            Card amount must cover the platform fee (min ${platformFee.toFixed(2)})
          </p>
        )}
      </div>

      {/* Validation status */}
      {cashInputValue && !isCashValid && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs">
          Cash amount cannot exceed total of ${totalAmount.toFixed(2)}
        </div>
      )}
    </div>
  );
}
