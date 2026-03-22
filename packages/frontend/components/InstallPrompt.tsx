/**
 * InstallPrompt
 *
 * Captures the browser's `beforeinstallprompt` event and shows a native-feeling
 * banner at the bottom of the screen inviting the user to add FindA.Sale to their
 * home screen.  The banner is suppressed for 30 days after a user dismisses it.
 *
 * Rules:
 * - Never shown if already installed (display-mode: standalone)
 * - Never shown on iOS (iOS uses a separate Share → Add to Home Screen flow; we
 *   show a one-time informational tooltip for that instead)
 * - Respects a "dismissed until" timestamp in localStorage
 */

import { useState, useEffect } from 'react';

const DISMISS_KEY = 'findasale_install_dismissed_until';
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
  } catch {
    // Ignore storage errors
  }
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    // Check dismissal and standalone status on mount
    if (isStandalone() || isDismissed()) {
      setShowAndroid(false);
      setShowIOS(false);
      return;
    }

    if (isIOS()) {
      // Show the iOS instructions tooltip once per dismissal period
      setShowIOS(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      // Check localStorage (7-day dismissal)
      if (!isDismissed()) {
        setDeferredPrompt(e);
        setShowAndroid(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowAndroid(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed();
    setShowAndroid(false);
    setShowIOS(false);
  };

  // Final guard: never render if dismissed or standalone (double-check at render time)
  if ((showAndroid || showIOS) && (isDismissed() || isStandalone())) {
    return null;
  }

  if (showAndroid) {
    return (
      <div
        role="dialog"
        aria-label="Install FindA.Sale"
        // bottom-16 on mobile = 64px, clears the h-14 BottomTabNav (56px) + 8px gap.
        // sm:bottom-4 floats the card 16px above the viewport edge on wider screens.
        // BottomTabNav is md:hidden so the offset is only needed below sm breakpoint.
        className="fixed bottom-16 left-0 right-0 z-50 bg-white border-t border-warm-200 shadow-lg px-4 py-4 flex items-center gap-4 sm:bottom-4 sm:max-w-md sm:mx-auto sm:rounded-xl sm:border"
      >
        {/* App icon */}
        <img src="/icons/icon-72x72.png" alt="FindA.Sale icon" className="w-12 h-12 rounded-xl flex-shrink-0"  loading="lazy"/>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-warm-900 text-sm leading-tight">Add FindA.Sale to your home screen</p>
          <p className="text-xs text-warm-500 mt-0.5">Quick access to sales near you — no app store needed</p>
        </div>

        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="text-xs text-warm-400 hover:text-warm-600 text-center"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (showIOS) {
    return (
      <div
        role="dialog"
        aria-label="Add FindA.Sale to Home Screen"
        // bottom-20 on mobile = 80px, clears BottomTabNav (56px) + safe-area buffer.
        // sm:bottom-4 uses standard floating position on wider screens.
        className="fixed bottom-20 left-4 right-4 z-50 sm:bottom-4 bg-warm-900 text-white rounded-2xl shadow-xl px-4 py-4"
      >
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-4 text-warm-400 hover:text-white text-xl leading-none"
          aria-label="Dismiss"
        >
          &times;
        </button>
        <p className="font-semibold text-sm mb-1">Add FindA.Sale to your Home Screen</p>
        <p className="text-xs text-warm-300 leading-relaxed">
          Tap the{' '}
          <span className="inline-block mx-1">
            {/* Safari share icon approximation */}
            <svg className="inline w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/>
            </svg>
          </span>{' '}
          Share button, then choose <strong>"Add to Home Screen"</strong>.
        </p>
      </div>
    );
  }

  return null;
}
