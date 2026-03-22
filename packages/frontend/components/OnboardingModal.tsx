import React, { useState } from 'react';

interface OnboardingModalProps {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: '🏠',
    title: 'Welcome to FindA.Sale!',
    body: 'Discover estate sales, garage sales, and auctions near you. Browse hundreds of items and find amazing deals in your area.',
    cta: 'Show me around',
    secondary: 'Skip',
  },
  {
    icon: '♥',
    title: 'Save what you love',
    body: 'Tap the heart on any item to save it. You earn 2 Hunt Pass points every time you favorite — plus 1 point just for visiting a sale!',
    cta: 'Got it',
    secondary: 'Skip',
  },
  {
    icon: '🔔',
    title: 'Never miss a sale',
    body: 'Get alerts when sales near you go live and when organizers you follow post new items. You can disable notifications anytime in your profile settings.',
    cta: 'Enable Notifications',
    secondary: 'Maybe later',
  },
];

/**
 * Phase 27: 3-step onboarding modal for new shoppers.
 * Shown once after first login. Completion stored in localStorage.
 */
const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const handleCta = async () => {
    if (step === 2) {
      // Step 3: request push notification permission
      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          await Notification.requestPermission();
        } catch {
          // Non-fatal — user may have blocked or browser may not support it
        }
      }
      onComplete();
      return;
    }
    setStep((s) => s + 1);
  };

  const handleSkip = () => {
    // Persist skip flag IMMEDIATELY before calling onComplete
    // This prevents race condition where navigation triggers before flag is written
    if (typeof window !== 'undefined') {
      localStorage.setItem('findasale_onboarded', '1');
    }
    onComplete();
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        {/* Step progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-amber-600' : 'w-2 bg-warm-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="text-5xl text-center mb-4">{current.icon}</div>

        {/* Content */}
        <h2 className="text-xl font-bold text-warm-900 dark:text-gray-100 text-center mb-3">{current.title}</h2>
        <p className="text-warm-600 dark:text-gray-400 text-center text-sm leading-relaxed mb-6">{current.body}</p>

        {/* Buttons */}
        <button
          onClick={handleCta}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition-colors mb-2"
        >
          {current.cta}
        </button>
        <button
          onClick={handleSkip}
          className="w-full text-warm-400 dark:text-gray-400 hover:text-warm-600 dark:hover:text-gray-300 text-sm py-2 transition-colors"
        >
          {current.secondary}
        </button>
      </div>
    </div>
  );
};

export default OnboardingModal;
