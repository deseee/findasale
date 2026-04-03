import React, { useState } from 'react';
import Link from 'next/link';

interface OrganizerOnboardingModalProps {
  onDismiss: () => void;
}

const STEPS = [
  {
    headline: 'Welcome to FindA.Sale',
    subtext: "You're 5 minutes from your first sale. Here's how it works.",
    visual: (
      <div className="flex justify-center items-center gap-4 mb-6">
        <div className="flex flex-col items-center">
          <div className="text-3xl mb-2">📋</div>
          <div className="text-xs font-semibold text-warm-700 dark:text-warm-300">1 • Describe</div>
        </div>
        <div className="text-warm-400">→</div>
        <div className="flex flex-col items-center">
          <div className="text-3xl mb-2">📷</div>
          <div className="text-xs font-semibold text-warm-700 dark:text-warm-300">2 • Add Photos</div>
        </div>
        <div className="text-warm-400">→</div>
        <div className="flex flex-col items-center">
          <div className="text-3xl mb-2">🚀</div>
          <div className="text-xs font-semibold text-warm-700 dark:text-warm-300">3 • Publish</div>
        </div>
      </div>
    ),
    cta: 'Let\'s go →',
  },
  {
    headline: 'Great photos = more sales',
    subtext:
      'Use your phone camera. Smart tagging automatically suggests descriptions and prices. Blurry photos get flagged — we\'ll tell you which ones to retake.',
    visual: (
      <div className="text-center mb-6">
        <div className="text-6xl">📷</div>
      </div>
    ),
    cta: 'Got it →',
  },
  {
    headline: 'Your sale, your rules',
    subtext:
      'Set your own prices, hours, and hold policy. Buyers can reserve items before your sale starts — you approve every hold.',
    visual: (
      <div className="text-center mb-6">
        <div className="text-6xl">⚙️</div>
      </div>
    ),
    cta: 'Start my first sale',
  },
];

/**
 * OrganizerOnboardingModal
 * 3-screen modal for new organizers (0 sales).
 * Triggered on /organizer/dashboard if localStorage.onboardingModalDismissed is not set.
 * TODO: import OrganizerOnboardingModal in organizer/dashboard.tsx for State 1 (new organizer)
 */
const OrganizerOnboardingModal: React.FC<OrganizerOnboardingModalProps> = ({ onDismiss }) => {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step === STEPS.length - 1) {
      // Complete onboarding — dismiss modal, stay on dashboard
      if (typeof window !== 'undefined') {
        localStorage.setItem('onboardingModalDismissed', 'true');
      }
      onDismiss();
      return;
    }
    setStep(step + 1);
  };

  const handleSkip = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('onboardingModalDismissed', 'true');
    }
    onDismiss();
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Step progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-amber-600' : 'w-2 bg-warm-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Visual */}
        {current.visual}

        {/* Headline */}
        <h2 className="text-2xl font-bold text-warm-900 dark:text-gray-100 text-center mb-3">{current.headline}</h2>

        {/* Subtext */}
        <p className="text-warm-600 dark:text-gray-400 text-center text-sm leading-relaxed mb-8">{current.subtext}</p>

        {/* CTA Button */}
        <button
          onClick={handleNext}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition-colors mb-3"
        >
          {current.cta}
        </button>

        {/* Skip link */}
        <button
          onClick={handleSkip}
          className="w-full text-warm-500 dark:text-warm-400 hover:text-warm-700 dark:hover:text-warm-300 text-sm py-2 transition-colors"
        >
          {step === STEPS.length - 1 ? 'Skip for now' : 'Skip'}
        </button>
      </div>
    </div>
  );
};

export default OrganizerOnboardingModal;
