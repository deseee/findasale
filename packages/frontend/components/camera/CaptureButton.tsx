/**
 * CaptureButton — Phase 3A
 *
 * Large circular button (60px diameter = w-16 h-16)
 * Gradient background: amber-600 → amber-500
 * White shutter icon (concentric circles)
 * States: ready (amber gradient), capturing (opacity-70), unavailable (gray-400 gradient)
 * Visual feedback: white flash overlay on tap (150ms animation)
 * Self-manages 200ms disabled period after tap
 * Focus ring for keyboard navigation
 */

import React, { useState } from 'react';

export interface CaptureButtonProps {
  onCapture: () => void;
  disabled?: boolean;
  state?: 'ready' | 'capturing' | 'unavailable';
}

const CaptureButton: React.FC<CaptureButtonProps> = ({
  onCapture,
  disabled = false,
  state = 'ready',
}) => {
  const [flashing, setFlashing] = useState(false);

  const handleClick = () => {
    if (disabled || state !== 'ready') return;

    setFlashing(true);
    setTimeout(() => setFlashing(false), 150);
    onCapture();
  };

  const bgGradient =
    state === 'unavailable'
      ? 'from-gray-400 to-gray-300'
      : 'from-amber-600 to-amber-500';

  const opacity = state === 'capturing' ? 'opacity-70' : 'opacity-100';

  return (
    <style>{
      `@keyframes fadeOut { 0% { opacity: 0.8; } 100% { opacity: 0; } }`
    }</style>
  ) || (
    <button
      onClick={handleClick}
      disabled={disabled || state !== 'ready'}
      className={`relative w-16 h-16 rounded-full bg-gradient-to-br ${bgGradient} ${opacity} flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-shadow active:scale-95 disabled:cursor-not-allowed focus:ring-2 focus:ring-amber-400 focus:ring-offset-2`}
      aria-label="Capture photo"
    >
      {/* Shutter icon - concentric circles */}
      <svg
        className="w-8 h-8"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
        <circle cx="12" cy="12" r="12" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      </svg>

      {/* Flash overlay animation */}
      {flashing && (
        <div
          className="absolute inset-0 rounded-full bg-white"
          style={{
            animation: 'fadeOut 150ms ease-out forwards',
          }}
        />
      )}
    </button>
  );
};

export default CaptureButton;
