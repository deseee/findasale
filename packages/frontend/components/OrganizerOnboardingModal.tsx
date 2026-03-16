import React, { useState } from 'react';
import { useRouter } from 'next/router';

interface OrganizerOnboardingModalProps {
  onClose: () => void;
}

const STEPS = [
  {
    title: 'Welcome to FindA.Sale! 🏡',
    body: "You're set up as a sale organizer. Let's walk through creating your first sale — it only takes a few minutes.",
    cta: 'Let\'s go →',
  },
  {
    icon: '📋',
    title: 'Step 1: Create a Sale',
    body: 'Go to \'My Sales\' → \'New Sale\'. Add your sale title, dates, and address. Your sale starts as a Draft — only you can see it until you publish.',
    cta: 'Got it →',
  },
  {
    icon: '📸',
    title: 'Step 2: Add Items',
    body: 'Upload photos of each item. Our AI will suggest a title, description, and price — you can edit anything. Add items one at a time or in bulk.',
    cta: 'Got it →',
  },
  {
    icon: '🚀',
    title: 'Step 3: Go Live',
    body: 'When you\'re ready, publish your sale. Share your unique QR code and link with shoppers. Buyers can browse, bid, and purchase directly — you get paid via Stripe.',
    cta: 'Got it →',
  },
  {
    icon: '🎉',
    title: 'You\'re all set!',
    body: 'Your organizer dashboard is ready. Create your first sale whenever you\'re ready. Questions? Check the Help guide or email support@finda.sale.',
    cta: 'Go to My Dashboard',
  },
];

/**
 * Post-registration onboarding walkthrough for new ORGANIZER users.
 * Shown once after first login, completion stored in localStorage.
 */
const OrganizerOnboardingModal: React.FC<OrganizerOnboardingModalProps> = ({ onClose }) => {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const handleCta = () => {
    if (step === STEPS.length - 1) {
      // Final step: navigate to organizer dashboard and close modal
      router.push('/organizer/dashboard');
      onClose();
      return;
    }
    setStep((s) => s + 1);
  };

  const handleClose = () => {
    onClose();
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        {/* Close X button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-warm-400 dark:text-gray-400 hover:text-warm-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

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
        {current.icon && (
          <div className="text-5xl text-center mb-4">{current.icon}</div>
        )}

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
        {step < STEPS.length - 1 && (
          <button
            onClick={handleClose}
            className="w-full text-warm-400 dark:text-gray-400 hover:text-warm-600 dark:hover:text-gray-300 text-sm py-2 transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
};

export default OrganizerOnboardingModal;
