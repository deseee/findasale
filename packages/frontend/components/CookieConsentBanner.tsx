import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const CookieConsentBanner = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show on client side
    if (typeof window === 'undefined') return;

    // Check if user has already made a choice
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'accepted');
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('cookieConsent', 'declined');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-warm-200 dark:border-gray-700 shadow-2xl"
      role="alert"
    >
      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-warm-700 dark:text-warm-300 flex-1">
          We use cookies to keep you signed in and improve your experience. By continuing, you agree to our{' '}
          <Link href="/privacy" className="text-amber-600 hover:text-amber-700 dark:hover:text-amber-400 underline">
            Privacy Policy
          </Link>{' '}
          and use of cookies.
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleDecline}
            className="px-4 py-2 text-sm font-medium text-warm-700 dark:text-warm-300 border border-warm-300 dark:border-gray-600 rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
            aria-label="Decline cookies"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 rounded-lg transition-colors"
            aria-label="Accept cookies"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsentBanner;
