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
import OnboardingModal from '../components/OnboardingModal'; // Phase 27
import OrganizerOnboardingModal from '../components/OrganizerOnboardingModal';
import ErrorBoundary from '../components/ErrorBoundary';
import NudgeBar from '../components/NudgeBar';

// SW update notifier — renders a dismissible toast when a new service worker is waiting
// Registers the user's browser for push notifications once they're logged in
function PushSubscriber() {
  usePushSubscription();
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
