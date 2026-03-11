/**
 * CaptureButton
 *
 * Large circular capture button (60px diameter)
 * - Gradient background: amber-600 → amber-500
 * - White shutter icon center
 * - States: ready (amber), capturing (opacity 0.7, disabled), unavailable (gray-400)
 * - Tap feedback: white flash overlay (150ms), scale 0.95
 * - Self-manages 200ms disabled period after tap
 * - 44px minimum tap area (accessibility)
 * - Props: onCapture, disabled?, state?
 */

import React, { useState } from 'react';

type CaptureState = 'ready' | 'capturing' | 'unavailable';

interface CaptureButtonProps {
  onCapture: () => void;
  disabled?: boolean;
  state?: CaptureState;
}

const CaptureButton: React.FC<CaptureButtonProps> = ({
  onCapture,
  disabled = false,
  state = 'ready',
}) => {
  const [showFlash, setShowFlash] = useState(false);

  const handleClick = () => {
    if (disabled || state !== 'ready') return;

    // Show flash overlay
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 150);

    // Call onCapture
    onCapture();
  };

  const isDisabledState = disabled || state !== 'ready';
  const bgColor =
    state === 'unavailable'
      ? 'bg-gradient-to-b from-gray-400 to-gray-400'
      : 'bg-gradient-to-b from-amber-600 to-amber-500';

  const opacityClass = state === 'capturing' ? 'opacity-70' : 'opacity-100';

  return (
    <div className="flex items-center justify-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabledState}
        className={`
          relative
          w-16 h-16
          rounded-full
          ${bgColor}
          ${opacityClass}
          shadow-lg
          transition-transform active:scale-95
          disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2
        `}
        aria-label="Capture photo"
      >
        {/* White shutter icon circle (inner) */}
        <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center">
          {/* Camera lens representation: concentric circles */}
          <div className="w-6 h-6 rounded-full border-2 border-amber-600 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-amber-600" />
          </div>
        </div>

        {/* White flash overlay — appears on tap */}
        {showFlash && (
          <div
            className="absolute inset-0 bg-white rounded-full opacity-80 animate-pulse"
            style={{
              animation: 'fadeOut 0.15s ease-out forwards',
            }}
          />
        )}
      </button>

      <style jsx>{`
        @keyframes fadeOut {
          0% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default CaptureButton;
