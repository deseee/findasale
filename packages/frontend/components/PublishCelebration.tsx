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
}

const PublishCelebration: React.FC<PublishCelebrationProps> = ({
  isOpen,
  saleName,
  saleId,
  salePhotoUrl,
  onClose,
}) => {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowConfetti(true);
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

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

          {/* Subtext */}
          <p className="text-warm-600 dark:text-gray-300 mb-8 text-lg">
            Your sale is now visible to shoppers on the map and in search results.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Link
              href={`/organizer/edit-sale/${saleId}`}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              View Sale
            </Link>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>

          {/* Hint: click to close */}
          <p className="text-xs text-warm-400 dark:text-gray-500 mt-6">
            Click anywhere to dismiss
          </p>
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
