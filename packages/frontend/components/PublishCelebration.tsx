/**
 * PublishCelebration — Full-screen celebration modal
 * Phase 27: Microinteractions — celebrates when organizer publishes a sale
 *
 * Features:
 * - Full-screen overlay with fixed positioning
 * - Large "You're live!" heading
 * - Sale name and thumbnail
 * - Confetti animation
 * - Auto-dismiss after 5 seconds OR click to close
 * - CTAs: "View Sale" and "Done"
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Confetti from './Confetti';

interface PublishCelebrationProps {
  isOpen: boolean;
  saleName: string;
  saleId: string;
  salePhotoUrl?: string | null;
  onClose: () => void;
  /** Guided first-sale flow (2026-10-12): total items in the sale. 0 + onAddItems shows the add-items variant. */
  itemCount?: number;
  onAddItems?: () => void;
}

const PublishCelebration: React.FC<PublishCelebrationProps> = ({
  isOpen,
  saleName,
  saleId,
  salePhotoUrl,
  onClose,
  itemCount,
  onAddItems,
}) => {
  const [showConfetti, setShowConfetti] = useState(false);
  // A live sale with no items: the next step is adding items, so the modal stays until the
  // organizer picks "Add your first item" or "Later" (no 5-second auto-dismiss).
  const isEmptySale = itemCount === 0 && typeof onAddItems === 'function';

  useEffect(() => {
    if (isOpen) {
      setShowConfetti(true);
      if (isEmptySale) return;
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose, isEmptySale]);

  if (!isOpen) return null;

  return (
    <>
      <Confetti isActive={showConfetti} onComplete={() => setShowConfetti(false)} />

      <div
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebrate-title"
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl text-center p-8 md:p-12 animate-bounce-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Heading */}
          <h2
            id="celebrate-title"
            className="text-4xl md:text-5xl font-bold text-amber-600 dark:text-amber-400 mb-4 leading-tight"
          >
            You're live! 🎉
          </h2>

          {/* Sale name */}
          <p className="text-2xl font-semibold text-warm-900 dark:text-gray-100 mb-6 break-words">
            {saleName}
          </p>

          {/* Sale photo (if available) */}
          {salePhotoUrl && (
            <div className="mb-8 -mx-8 md:-mx-12">
              <img
                src={salePhotoUrl}
                alt={saleName}
                className="w-full h-48 object-cover"
              />
            </div>
          )}

          {isEmptySale ? (
            <>
              {/* Subtext */}
              <p className="text-warm-600 dark:text-gray-300 mb-8 text-lg">
                Shoppers can see your dates and place. Add items so they have something to browse.
              </p>

              {/* CTA */}
              <button
                type="button"
                onClick={onAddItems}
                autoFocus
                className="w-full min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
              >
                Add your first item
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 min-h-[44px] px-4 text-sm underline text-warm-600 dark:text-gray-300"
              >
                Later
              </button>
            </>
          ) : (
            <>
              {/* Subtext */}
              <p className="text-warm-600 dark:text-gray-300 mb-8 text-lg">
                Your sale is published and ready for shoppers.
              </p>

              {/* CTA */}
              <button
                onClick={onClose}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Continue <span className="text-lg">→</span>
              </button>

              {/* Hint: click to close */}
              <p className="text-xs text-warm-400 dark:text-gray-500 mt-6">
                Click anywhere to dismiss
              </p>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes bounceIn {
          0% {
            opacity: 0;
            transform: scale(0.9);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-bounce-in {
          animation: bounceIn 0.5s ease-out;
        }
      `}</style>
    </>
  );
};

export default PublishCelebration;
