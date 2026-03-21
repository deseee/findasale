import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession, signOut } from 'next-auth/react';
import api from '../lib/api';
import Layout from '../components/Layout';
import { AuthProvider, useAuth } from '../components/AuthContext';
import { ToastProvider, useToast } from '../components/ToastContext';
import InstallPrompt from '../components/InstallPrompt';
import { usePushSubscription } from '../hooks/usePushSubscription';
import { useTheme } from '../hooks/useTheme'; // #63: Dark Mode
import { useSentryUserContext } from '../hooks/useSentryUserContext'; // Feature #21: User Impact Scoring
import OnboardingModal from '../components/OnboardingModal'; // Phase 27
import OrganizerOnboardingModal from '../components/OrganizerOnboardingModal';
import ErrorBoundary from '../components/ErrorBoundary';
import NudgeBar from '../components/NudgeBar';
import { DegradationProvider } from '../contexts/DegradationContext'; // Feature #20: Proactive Degradation Mode
import DegradationBanner from '../components/DegradationBanner'; // Feature #20: Proactive Degradation Mode
import { useDegradationMode } from '../hooks/useDegradationMode'; // Feature #20: Proactive Degradation Mode
import { LowBandwidthProvider } from '../contexts/LowBandwidthContext'; // Feature #22: Low-Bandwidth Mode
import LowBandwidthBanner from '../components/LowBandwidthBanner'; // Feature #22: Low-Bandwidth Mode
import { useLowBandwidthInitializer } from '../hooks/useLowBandwidthInitializer'; // Feature #22: Low-Bandwidth Mode
import { useOfflineSync } from '../hooks/useOfflineSync'; // Feature #69: Local-First Offline Mode

// #63 Dark Mode — Apply theme class on mount to prevent FOUC
function ThemeInitializer() {
  useTheme(); // Side effect: applies dark/light class to <html> on mount

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedSize = localStorage.getItem('findasale_font_size');
    if (savedSize) {
      document.documentElement.style.setProperty('--base-font-size', savedSize + 'px');
    }
  }, []);

  return null;
}

// SW update notifier — renders a dismissible toast when a new service worker is waiting
// Registers the user's browser for push notifications once they're logged in
function PushSubscriber() {
  usePushSubscription();
  return null;
}

// Feature #21: Sync user context to Sentry on every login/logout
// Enables prioritization by user impact (tier, points, hunt pass status)
function SentryUserContextSync() {
  useSentryUserContext();
  return null;
}

// Feature #69: Initialize offline sync on app mount
function OfflineSyncInitializer() {
  useOfflineSync(); // Initialize IndexedDB, register online/offline listeners, auto-sync on reconnect
  return null;
}

// Feature #22: Monitor network quality and sync to global context
function LowBandwidthMonitor() {
  useLowBandwidthInitializer(); // Syncs network quality hook to LowBandwidthContext
  return null;
}

function ServiceWorkerUpdateNotifier() {
  const { showToast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      // A new SW has taken control — prompt user to reload for the latest version
      showToast('A new version is available. Reload to update.', 'info');
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [showToast]);

  return null;
}

// Phase 31: Bridge NextAuth OAuth session → our JWT AuthContext.
function OAuthBridge() {
  const { data: session, status } = useSession();
  const { login, user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    const backendJwt = (session as any)?.backendJwt;
    if (status === 'authenticated' && backendJwt && !authLoading && !user) {
      login(backendJwt);
      signOut({ redirect: false });
    }
  }, [session, status, user, authLoading, login]);

  return null;
}

/**
 * Phase 27: Show 3-step onboarding modal to new shoppers on first login.
 * Organizers and admins are excluded. Completion stored in localStorage.
 */
function OnboardingShower() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user || user.roles?.includes('ORGANIZER') || user.roles?.includes('ADMIN')) return;
    if (typeof window === 'undefined') return;
    const done = localStorage.getItem('findasale_onboarded');
    if (!done) setShow(true);
  }, [user]);

  const handleComplete = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('findasale_onboarded', '1');
    }
    setShow(false);
  };

  if (!show) return null;
  return <OnboardingModal onComplete={handleComplete} />;
}

/**
 * Show organizer onboarding modal for new ORGANIZER users on first login.
 * Completion flag is stored on backend (Organizer.onboardingComplete) and included in JWT.
 * CRITICAL: Do NOT show to ADMIN-only users. Show ONLY to users with ORGANIZER role.
 */
function OrganizerOnboardingShower() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Show ONLY if user has ORGANIZER role (excludes ADMIN-only users)
    if (!user.roles?.includes('ORGANIZER')) return;
    // Don't show if already onboarded
    if (user.onboardingComplete) return;
    // Only show on organizer pages — not public pages like /inspiration, /trending
    const orgPages = ['/organizer', '/dashboard', '/manage-sales', '/create-sale'];
    if (!orgPages.some(p => router.pathname.startsWith(p))) return;
    setShow(true);
  }, [user, router.pathname]);

  const handleClose = async () => {
    try {
      // Mark onboarded on backend and get fresh JWT
      const res = await api.post('/organizers/me/onboarding-complete');
      if (res.data.token) {
        login(res.data.token); // Updates user context with onboarding: true
      }
    } catch (e) {
      console.error('Failed to mark onboarding complete:', e);
      // Fallback: don't show again this session
    }
    // Belt-and-suspenders: also set localStorage for extra safety
    if (typeof window !== 'undefined') {
      localStorage.setItem('organizer_onboarded', 'true');
    }
    setShow(false);
  };

  if (!show) return null;
  return <OrganizerOnboardingModal onClose={handleClose} />;
}

/**
 * Feature #20: Monitor server degradation and update global state
 */
function DegradationMonitor() {
  useDegradationMode(); // Polls every 10s when authenticated
  return null;
}

/**
 * Bug #6: Listen for 429 rate limit events from api.ts interceptor
 * and display user-visible toast notification
 */
function RateLimitListener() {
  const { showToast } = useToast();

  useEffect(() => {
    const handleRateLimit = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { message } = customEvent.detail;
      showToast(message, 'warning');
    };

    window.addEventListener('rateLimit429', handleRateLimit);
    return () => window.removeEventListener('rateLimit429', handleRateLimit);
  }, [showToast]);

  return null;
}

/**
 * #18: Capture and record UTM parameters on page load
 * Fires a silent pixel call to record social link clicks
 */
function UTMCapture() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const { utm_source, utm_medium, utm_campaign, utm_content, saleId } = router.query;

    // Only fire if we have UTM params
    if (!utm_source && !utm_medium && !utm_campaign && !utm_content) {
      return;
    }

    if (!saleId || typeof saleId !== 'string') {
      return;
    }

    // Fire-and-forget pixel call (no await, silent failure)
    const params = new URLSearchParams();
    params.append('saleId', saleId);
    if (typeof utm_source === 'string') params.append('utm_source', utm_source);
    if (typeof utm_medium === 'string') params.append('utm_medium', utm_medium);
    if (typeof utm_campaign === 'string') params.append('utm_campaign', utm_campaign);
    if (typeof utm_content === 'string') params.append('utm_content', utm_content);

    fetch(`/api/link-clicks/record?${params}`, { method: 'GET' }).catch(() => {}); // Silent fail
  }, [router.query]);

  return null;
}

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000, // Garbage collect after 5 min to prevent quota exceeded on mobile
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider session={session}>
      <ToastProvider>
        <AuthProvider>
          <DegradationProvider>
            <LowBandwidthProvider>
              <QueryClientProvider client={queryClient}>
              <ThemeInitializer />
              <ErrorBoundary key={router.asPath}>
                <Layout>
                  <Component {...pageProps} />
                </Layout>
              </ErrorBoundary>
              {/* PWA helpers */}
              <ServiceWorkerUpdateNotifier />
              <PushSubscriber />
              <InstallPrompt />
              <NudgeBar />
              {/* Bug #6: Rate limit toast listener */}
              <RateLimitListener />
              {/* Feature #20: Proactive Degradation Mode */}
              <DegradationMonitor />
              <DegradationBanner />
              {/* Feature #22: Low-Bandwidth Mode */}
              <LowBandwidthMonitor />
              <LowBandwidthBanner />
              {/* #18: UTM capture for social link clicks */}
              <UTMCapture />
              {/* Feature #21: Sentry user context sync */}
              <SentryUserContextSync />
              {/* Feature #69: Offline sync initialization */}
              <OfflineSyncInitializer />
              {/* Phase 31: OAuth → JWT bridge */}
              <OAuthBridge />
              {/* Phase 27: First-time shopper onboarding */}
              <OnboardingShower />
              {/* Organizer post-registration onboarding */}
              <OrganizerOnboardingShower />
              </QueryClientProvider>
            </LowBandwidthProvider>
          </DegradationProvider>
        </AuthProvider>
      </ToastProvider>
    </SessionProvider>
  );
}

export default MyApp;
