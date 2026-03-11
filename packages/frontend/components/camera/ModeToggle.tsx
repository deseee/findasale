/**
 * ModeToggle — Phase 3A
 *
 * Two-mode pill-button toggle: 'Rapidfire' | 'Regular'
 * Active mode: amber-600 bg, white text, rounded-full, smooth transition
 * Inactive mode: text-gray-500, hover:text-gray-700
 */

import React from 'react';

export interface ModeToggleProps {
  mode: 'rapidfire' | 'regular';
  onChange: (mode: 'rapidfire' | 'regular') => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onChange }) => {
  return (
    <div className="flex items-center gap-2 bg-warm-50 rounded-full p-1 border border-warm-200">
      <button
        onClick={() => onChange('rapidfire')}
        aria-pressed={mode === 'rapidfire'}
        className={`px-4 py-1.5 rounded-full font-medium text-sm transition-all ${
          mode === 'rapidfire'
            ? 'bg-amber-600 text-white'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Rapidfire
      </button>
      <button
        onClick={() => onChange('regular')}
        aria-pressed={mode === 'regular'}
        className={`px-4 py-1.5 rounded-full font-medium text-sm transition-all ${
          mode === 'regular'
            ? 'bg-amber-600 text-white'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Regular
      </button>
    </div>
  );
};

export default ModeToggle;
