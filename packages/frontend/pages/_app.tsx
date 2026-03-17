import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession, signOut } from 'next-auth/react';
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
    if (!user || user.role === 'ORGANIZER' || user.role === 'ADMIN') return;
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
 * Completion stored in localStorage.
 */
function OrganizerOnboardingShower() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'ORGANIZER') return;
    if (typeof window === 'undefined') return;
    const done = localStorage.getItem('organizer_onboarded');
    if (!done) setShow(true);
  }, [user]);

  const handleClose = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('organizer_onboarded', 'true');
    }
    setShow(false);
  };

  if (!show) return null;
  return <OrganizerOnboardingModal onClose={handleClose} />;
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
            {/* #18: UTM capture for social link clicks */}
            <UTMCapture />
            {/* Feature #21: Sentry user context sync */}
            <SentryUserContextSync />
            {/* Phase 31: OAuth → JWT bridge */}
            <OAuthBridge />
            {/* Phase 27: First-time shopper onboarding */}
            <OnboardingShower />
            {/* Organizer post-registration onboarding */}
            <OrganizerOnboardingShower />
          </QueryClientProvider>
        </AuthProvider>
      </ToastProvider>
    </SessionProvider>
  );
}

export default MyApp;
