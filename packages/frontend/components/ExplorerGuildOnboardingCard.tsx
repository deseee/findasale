import React, { useState } from 'react';
import { Compass } from 'lucide-react';

interface ExplorerGuildOnboardingCardProps {
  onDismiss: () => void;
}

/**
 * Explorer's Guild Onboarding Card
 * Shown to INITIATE users to introduce the Explorer's Guild system
 * Displays getting started steps and calls to action
 */
const ExplorerGuildOnboardingCard: React.FC<ExplorerGuildOnboardingCardProps> = ({ onDismiss }) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('explorer_guild_onboarded', 'true');
      }
      onDismiss();
    }, 150);
  };

  const steps = [
    {
      icon: '🚪',
      title: 'Visit a Sale',
      description: 'Check in at any sale to earn your first XP',
    },
    {
      icon: '📱',
      title: 'Scan & Explore',
      description: 'Scan items with your phone to earn XP and discover treasures',
    },
    {
      icon: '🛍️',
      title: 'Make a Purchase',
      description: 'Buy items to earn XP and climb the ranks',
    },
  ];

  return (
    <div
      className={`bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-lg shadow-md p-6 mb-8 transition-opacity duration-150 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Header with icon and title */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-4xl">🔍</div>
          <div>
            <h3 className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              Welcome to Explorer's Guild
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Earn XP and unlock perks as you explore
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 transition-colors text-2xl leading-none"
          aria-label="Dismiss onboarding card"
        >
          ×
        </button>
      </div>

      {/* Getting Started Steps */}
      <div className="mb-6">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-4">
          Getting Started
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-blue-100 dark:border-blue-800"
            >
              <div className="text-3xl mb-2">{step.icon}</div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1">
                {step.title}
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* How to Earn Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6 border border-blue-100 dark:border-blue-800">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          How to Earn XP
        </p>
        <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
          <div className="flex gap-2">
            <span className="flex-shrink-0">+2 XP</span>
            <span>Visit a sale (check-in)</span>
          </div>
          <div className="flex gap-2">
            <span className="flex-shrink-0">+3 XP</span>
            <span>Scan a QR code</span>
          </div>
          <div className="flex gap-2">
            <span className="flex-shrink-0">+25 XP</span>
            <span>Make a purchase</span>
          </div>
        </div>
      </div>

      {/* CTA and Info */}
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href="/shopper/loyalty"
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-center"
        >
          View Your Rank & Progress
        </a>
        <button
          onClick={handleDismiss}
          className="flex-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold py-2 px-4 rounded-lg border border-blue-200 dark:border-blue-700 transition-colors"
        >
          Got It
        </button>
      </div>

      {/* Info text */}
      <p className="text-xs text-gray-600 dark:text-gray-400 text-center mt-4">
        Ranks unlock real perks as you climb from Initiate → Grandmaster
      </p>
    </div>
  );
};

export default ExplorerGuildOnboardingCard;
