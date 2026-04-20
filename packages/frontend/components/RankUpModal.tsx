import React, { useEffect } from 'react';
import { ExplorerRank } from './RankBadge';
import { X } from 'lucide-react';

interface RankUpModalProps {
  rank: ExplorerRank;
  onDismiss: () => void;
}

const RANK_EMOJIS: Record<ExplorerRank, string> = {
  INITIATE: '🌱',
  SCOUT: '🔍',
  RANGER: '🎯',
  SAGE: '✨',
  GRANDMASTER: '👑',
};

const RANK_LABELS: Record<ExplorerRank, string> = {
  INITIATE: 'Initiate',
  SCOUT: 'Scout',
  RANGER: 'Ranger',
  SAGE: 'Sage',
  GRANDMASTER: 'Grandmaster',
};

const RANK_BENEFITS: Record<ExplorerRank, string[]> = {
  INITIATE: ['30 min holds', '1 concurrent hold', '1 wishlist save'],
  SCOUT: ['45 min holds', 'Scout Reveal (5 XP)', 'Haul Unboxing (2 XP)'],
  RANGER: ['60 min holds', '2 concurrent holds', 'Legendary early access (2h)'],
  SAGE: ['75 min holds', '3 concurrent holds', 'Legendary early access (4h)'],
  GRANDMASTER: ['90 min holds', 'Auto-confirm all holds', 'Legendary early access (6h)'],
};

export const RankUpModal: React.FC<RankUpModalProps> = ({ rank, onDismiss }) => {
  useEffect(() => {
    // Close on Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onDismiss]);

  const topBenefits = RANK_BENEFITS[rank];
  const emoji = RANK_EMOJIS[rank];
  const label = RANK_LABELS[rank];

  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes confetti-spin {
          0% {
            transform: translateY(-10vh) rotateZ(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotateZ(720deg);
            opacity: 0;
          }
        }

        .confetti-piece {
          position: fixed;
          top: 0;
          pointer-events: none;
          font-size: 24px;
        }

        .confetti-fall {
          animation: confetti-fall 4s ease-in forwards;
        }

        .confetti-spin {
          animation: confetti-spin 4s ease-in forwards;
        }
      `}</style>

      {/* Confetti pieces */}
      {Array.from({ length: 20 }).map((_, i) => {
        const confettiPieces = ['🎉', '🎊', '✨', '⭐', '🌟'];
        const piece = confettiPieces[i % confettiPieces.length];
        const leftPercent = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 3 + Math.random() * 1;

        return (
          <div
            key={i}
            className={i % 2 === 0 ? 'confetti-fall' : 'confetti-spin'}
            style={{
              left: `${leftPercent}%`,
              fontSize: '20px',
              animation: `${i % 2 === 0 ? 'confetti-fall' : 'confetti-spin'} ${duration}s ease-in forwards`,
              animationDelay: `${delay}s`,
            }}
          >
            {piece}
          </div>
        );
      })}

      {/* Modal Overlay */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50"
        onClick={onDismiss}
      >
        {/* Modal Card */}
        <div
          className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>

          {/* Rank Icon */}
          <div className="text-center mb-4">
            <div className="text-6xl inline-block">{emoji}</div>
          </div>

          {/* Celebration Text */}
          <h2 className="text-3xl font-bold text-center text-warm-900 dark:text-warm-100 mb-2">
            🎉 You're now a <span className="text-amber-600 dark:text-amber-400">{label}</span>!
          </h2>

          {/* Subtitle */}
          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6">
            Unlock new features and abilities
          </p>

          {/* Top Benefits Preview */}
          <div className="bg-sage-50 dark:bg-sage-900/20 rounded-lg p-4 mb-6 border border-sage-200 dark:border-sage-900/40">
            <p className="text-xs font-semibold text-sage-700 dark:text-sage-300 mb-2">
              New Perks Unlocked:
            </p>
            <ul className="space-y-1">
              {topBenefits.map((benefit, idx) => (
                <li
                  key={idx}
                  className="text-sm text-sage-800 dark:text-sage-200 flex items-start gap-2"
                >
                  <span className="text-base mt-0.5">✨</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                // Navigate to loyalty page — route TBD by Architect
                onDismiss();
              }}
              className="flex-1 px-4 py-2 bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white rounded-lg font-medium transition-colors"
            >
              See all unlocks
            </button>
            <button
              onClick={onDismiss}
              className="flex-1 px-4 py-2 border border-warm-200 dark:border-gray-700 text-warm-900 dark:text-warm-100 rounded-lg font-medium hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
            >
              Keep hunting
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default RankUpModal;
