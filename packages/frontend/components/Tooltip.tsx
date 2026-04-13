import { useState } from 'react';

interface TooltipProps {
  content: string;
  position?: 'top' | 'right' | 'bottom' | 'left';
}

export default function Tooltip({ content, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  // Position classes
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
        className="w-4 h-4 rounded-full bg-warm-200 text-warm-600 text-xs font-bold leading-none flex items-center justify-center hover:bg-amber-200 hover:text-amber-700 transition-colors cursor-help"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-label={`Help: ${content}`}
      >
        ?
      </button>
      {visible && (
        <span
          className={`absolute z-50 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg ${positionClasses[position]}`}
          role="tooltip"
        >
          {content}
          <span className="absolute w-2 h-2 bg-gray-900 rotate-45" />
        </span>
      )}
    </span>
  );
}
