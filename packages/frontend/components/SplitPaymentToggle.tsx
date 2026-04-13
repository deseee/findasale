import React from 'react';

interface SplitPaymentToggleProps {
  active: boolean;
  onToggle: (active: boolean) => void;
  disabled?: boolean;
}

export default function SplitPaymentToggle({
  active,
  onToggle,
  disabled = false,
}: SplitPaymentToggleProps) {
  return (
    <div className="p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 shadow-sm mb-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={disabled}
          className="w-5 h-5 rounded cursor-pointer accent-sage-600 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-sm font-medium text-warm-900 dark:text-warm-100">
          Split payment (cash + card)
        </span>
      </label>
      {active && (
        <p className="text-xs text-warm-600 dark:text-warm-400 mt-2">
          Customer will pay part in cash and part by card
        </p>
      )}
    </div>
  );
}
