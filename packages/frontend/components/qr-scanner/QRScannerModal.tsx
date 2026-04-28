import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { X, Check } from 'lucide-react';
import { useQRScanner } from './useQRScanner';
import { useToast } from '../ToastContext';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirmModal, setConfirmModal] = useState<{
    url: string;
    hostname: string;
  } | null>(null);
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [decodedText, setDecodedText] = useState<string | null>(null);

  const handleDecode = useCallback(
    (text: string) => {
      setDecodedText(text);

      try {
        const url = new URL(text);
        const hostname = url.hostname;

        // Check if it's a finda.sale domain or current origin
        if (hostname === 'finda.sale' || hostname === window.location.hostname) {
          // In-app navigation
          setShowCheckmark(true);
          setTimeout(() => {
            markCompleted();
            let pathname = url.pathname + url.search;
            // Append ?via=qr to treasure hunt clue URLs to signal this came from a QR scan
            if (pathname.includes('/treasure-hunt-qr/') && !pathname.includes('via=qr')) {
              const separator = pathname.includes('?') ? '&' : '?';
              pathname += separator + 'via=qr';
            }
            router.push(pathname);
            onClose();
          }, 600);
        } else if (url.protocol === 'http:' || url.protocol === 'https:') {
          // External URL — show confirm modal
          stop();
          setConfirmModal({ url: text, hostname });
        } else {
          // Not a valid URL
          showToast('QR decoded but it is not a FindA.Sale link. Scanned text: ' + text.substring(0, 60), 'info');
          stop();
        }
      } catch {
        // Not a valid URL
        showToast('QR decoded but it is not a FindA.Sale link. Scanned text: ' + text.substring(0, 60), 'info');
        stop();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, onClose, showToast]
  );

  const { state, error, start, stop, markCompleted } = useQRScanner({ onDecode: handleDecode });

  // Set localStorage flag on first open
  useEffect(() => {
    if (isOpen && !localStorage.getItem('qrScannerSeen')) {
      localStorage.setItem('qrScannerSeen', 'true');
    }
  }, [isOpen]);

  // Start scanner when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowCheckmark(false);
      setDecodedText(null);
      setConfirmModal(null);
      start('qr-scanner-viewfinder');
    } else {
      stop();
    }
    return () => {
      stop();
    };
  }, [isOpen, start, stop]);

  // Handle Esc key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Confirm modal for external URLs
  if (confirmModal) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100">
              Leave FindA.Sale?
            </h2>
            <button
              onClick={() => {
                setConfirmModal(null);
                start('qr-scanner-viewfinder');
              }}
              className="p-1 hover:bg-warm-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-warm-500" />
            </button>
          </div>

          <p className="text-sm text-warm-700 dark:text-warm-300 mb-4">
            This QR code links to{' '}
            <span className="font-medium">{confirmModal.hostname}</span>
            . Only continue if you trust this source.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setConfirmModal(null);
                start('qr-scanner-viewfinder');
              }}
              className="flex-1 px-4 py-2 rounded-lg bg-warm-100 dark:bg-gray-700 text-warm-900 dark:text-warm-100 hover:bg-warm-200 dark:hover:bg-gray-600 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                window.location.assign(confirmModal.url);
              }}
              className="flex-1 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main scanner modal
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col lg:items-center lg:justify-center lg:p-4">
      {/* Desktop: centered modal */}
      <div className="lg:bg-white dark:lg:bg-gray-800 lg:rounded-lg lg:shadow-xl w-full lg:w-96 lg:h-auto flex flex-col h-screen lg:max-h-96">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-warm-200 dark:border-gray-700 lg:border-b">
          <h2 className="text-lg font-semibold text-white lg:text-warm-900 dark:lg:text-warm-100">
            Scan QR Code
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-warm-100 dark:hover:bg-gray-700 lg:hover:bg-warm-100 dark:lg:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={24} className="text-white lg:text-warm-500 dark:lg:text-warm-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-black lg:bg-gray-50 dark:lg:bg-gray-900 relative overflow-hidden">
          {/* Viewfinder */}
          <div
            id="qr-scanner-viewfinder"
            className={`relative w-full max-w-64 aspect-square rounded-lg overflow-hidden border-2 border-amber-500 ${
              state === 'scanning' ? 'shadow-lg shadow-amber-500/50' : ''
            }`}
            style={{
              background: '#000',
            }}
          >
            {/* Corner brackets for visual guide */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-amber-400" />
              <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-amber-400" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 border-amber-400" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 border-amber-400" />
            </div>
          </div>

          {/* State-dependent UI */}
          <div className="mt-6 text-center w-full px-4">
            {state === 'requesting' && (
              <div className="space-y-3">
                <p className="text-sm text-white lg:text-warm-700 dark:lg:text-warm-300">
                  Requesting camera permission…
                </p>
              </div>
            )}

            {state === 'scanning' && (
              <div className="space-y-3">
                <p className="text-sm text-white lg:text-warm-700 dark:lg:text-warm-300">
                  Hold steady — we'll detect the QR automatically
                </p>
                {!localStorage.getItem('qrScannerSeen_hint_shown') && (
                  <>
                    <p className="text-xs text-amber-300 lg:text-amber-600 dark:lg:text-amber-500">
                      Point at a QR code to get started
                    </p>
                    {typeof window !== 'undefined' &&
                      localStorage.setItem('qrScannerSeen_hint_shown', 'true')}
                  </>
                )}
              </div>
            )}

            {state === 'denied' && (
              <div className="space-y-3">
                <p className="text-sm text-white lg:text-warm-900 dark:lg:text-warm-100 font-medium">
                  Camera blocked
                </p>
                <p className="text-xs text-white lg:text-warm-700 dark:lg:text-warm-300">
                  Open browser settings → Privacy → Camera → finda.sale → Allow
                </p>
                <button
                  onClick={() => {
                    start('qr-scanner-viewfinder');
                  }}
                  className="mt-3 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}

            {state === 'no-camera' && (
              <div className="space-y-3">
                <p className="text-sm text-white lg:text-warm-900 dark:lg:text-warm-100 font-medium">
                  No camera found
                </p>
                <p className="text-xs text-white lg:text-warm-700 dark:lg:text-warm-300">
                  Your device doesn't have a camera — try this on your phone
                </p>
              </div>
            )}

            {state === 'decoded' && showCheckmark && (
              <div className="space-y-3 animate-pulse">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Check size={32} className="text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <p className="text-sm text-white lg:text-warm-900 dark:lg:text-warm-100 font-medium">
                  Got it!
                </p>
              </div>
            )}

            {state === 'error' && (
              <div className="space-y-3">
                <p className="text-sm text-red-400 lg:text-red-600 dark:lg:text-red-400">
                  Error: {error}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRScannerModal;
