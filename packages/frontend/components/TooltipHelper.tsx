import { useState } from 'react';

interface TooltipHelperProps {
  text: string;
  position?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * TooltipHelper Component
 * Renders a ❓ icon that shows a tooltip on hover/tap.
 * Simple wrapper around a button with small floating card.
 */
export default function TooltipHelper({ text, position = 'top' }: TooltipHelperProps) {
  const [visible, setVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  };

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="w-5 h-5 rounded-full bg-warm-100 dark:bg-gray-700 text-warm-600 dark:text-warm-400 text-xs font-bold leading-none flex items-center justify-center hover:bg-warm-200 dark:hover:bg-gray-600 hover:text-warm-700 dark:hover:text-warm-300 transition-colors cursor-help"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-label={`Help: ${text}`}
      >
        ?
      </button>
      {visible && (
        <span
          className={`absolute z-50 w-56 bg-gray-900 dark:bg-gray-950 text-white dark:text-gray-100 text-xs rounded-lg px-3 py-2 shadow-lg ${positionClasses[position]}`}
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}
