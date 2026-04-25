import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import QRScannerModal from './QRScannerModal';

interface QRScannerButtonProps {
  variant?: 'compact' | 'tab';
  className?: string;
}

const QRScannerButton: React.FC<QRScannerButtonProps> = ({ variant = 'compact', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasSeenTooltip, setHasSeenTooltip] = useState(false);

  // Check if user has seen the first-time tooltip
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('qrScannerSeen');
      setHasSeenTooltip(!!seen);
    }
  }, []);

  // Hide tooltip if button is clicked
  const handleClick = () => {
    if (!hasSeenTooltip) {
      localStorage.setItem('qrScannerSeen', 'true');
      setHasSeenTooltip(true);
    }
    setShowTooltip(false);
    setIsOpen(true);
  };

  if (variant === 'compact') {
    // Icon-only button for desktop nav
    return (
      <>
        <div className="relative">
          <button
            onClick={handleClick}
            className={`p-2 text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-lg transition-colors ${className}`}
            aria-label="Scan QR code"
            onMouseEnter={() => !hasSeenTooltip && setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            title={hasSeenTooltip ? 'Scan QR code' : 'New: scan organizer QR codes from anywhere in the app'}
          >
            <Camera size={20} />
          </button>

          {/* First-time tooltip */}
          {showTooltip && !hasSeenTooltip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none">
              New: scan QR codes
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45" />
            </div>
          )}
        </div>

        <QRScannerModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  // Tab variant for BottomTabNav
  return (
    <>
      <button
        onClick={handleClick}
        className={`flex flex-col items-center justify-center flex-1 h-full min-w-touch transition-colors duration-150 ${
          isOpen
            ? 'text-amber-600'
            : 'text-warm-500 dark:text-gray-400 hover:text-warm-900 dark:hover:text-gray-100'
        } ${className}`}
        aria-label="Scan QR code"
      >
        <div className="relative">
          <Camera size={24} />
        </div>
        <span className="text-[10px] mt-0.5 font-medium leading-none">Scanner</span>
      </button>

      <QRScannerModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export default QRScannerButton;
