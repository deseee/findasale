/**
 * ModeToggle
 *
 * Two-mode toggle: "Rapidfire" | "Regular"
 * - Active pill: amber-600 bg, white text, rounded-full
 * - Inactive: text-gray-500
 * - Instant mode switch (no animation)
 * - Accessible with keyboard support
 */

import React from 'react';

type CameraMode = 'rapidfire' | 'regular';

interface ModeToggleProps {
  mode: CameraMode;
  onChange: (mode: CameraMode) => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onChange }) => {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-full p-0.5 w-fit">
      <button
        type="button"
        onClick={() => onChange('rapidfire')}
        className={`px-3 py-1 text-sm font-medium rounded-full transition-all ${
          mode === 'rapidfire'
            ? 'bg-amber-600 text-white'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        aria-pressed={mode === 'rapidfire'}
      >
        Rapidfire
      </button>
      <button
        type="button"
        onClick={() => onChange('regular')}
        className={`px-3 py-1 text-sm font-medium rounded-full transition-all ${
          mode === 'regular'
            ? 'bg-amber-600 text-white'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        aria-pressed={mode === 'regular'}
      >
        Regular
      </button>
    </div>
  );
};

export default ModeToggle;
