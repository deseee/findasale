import Script from 'next/script';
import { useEffect } from 'react';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// Extend window type for gtag
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

export default function GoogleAnalytics() {
  // If no measurement ID is configured, render nothing
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      {/* Load the gtag.js library */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      {/* Initialize gtag with consent-first defaults (GDPR compliant) */}
      <Script
        id="google-analytics-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());

            // Default to denied — only upgrade after explicit user consent
            gtag('consent', 'default', {
              analytics_storage: 'denied',
              ad_storage: 'denied',
              wait_for_update: 500
            });

            gtag('config', '${GA_MEASUREMENT_ID}', {
              page_path: window.location.pathname,
            });

            // If the user already accepted cookies in a prior visit, grant immediately
            try {
              var consent = localStorage.getItem('cookieConsent');
              if (consent === 'accepted') {
                gtag('consent', 'update', { analytics_storage: 'granted' });
              }
            } catch(e) {}
          `,
        }}
      />
      {/* Consent bridge — listens for the banner accept/decline and updates gtag */}
      <ConsentBridge />
    </>
  );
}

/**
 * Listens for consent changes made during the current page session
 * (i.e. the user clicks Accept on the CookieConsentBanner while GA is already loaded).
 * Uses a storage event so the banner doesn't need to know about GA.
 */
function ConsentBridge() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.gtag) return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key !== 'cookieConsent') return;
      if (e.newValue === 'accepted') {
        window.gtag('consent', 'update', { analytics_storage: 'granted' });
      } else if (e.newValue === 'declined') {
        window.gtag('consent', 'update', { analytics_storage: 'denied' });
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return null;
}
