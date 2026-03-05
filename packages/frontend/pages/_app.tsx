import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession, signOut } from 'next-auth/react';
import Layout from '../components/Layout';
import { AuthProvider, useAuth } from '../components/AuthContext';
import { ToastProvider, useToast } from '../components/ToastContext';
import InstallPrompt from '../components/InstallPrompt';
import { usePushSubscription } from '../hooks/usePushSubscription';
import OnboardingModal from '../components/OnboardingModal'; // Phase 27

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

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
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
            <Layout>
              <Component {...pageProps} />
            </Layout>
            {/* PWA helpers */}
            <ServiceWorkerUpdateNotifier />
            <PushSubscriber />
            <InstallPrompt />
            {/* Phase 31: OAuth → JWT bridge */}
            <OAuthBridge />
            {/* Phase 27: First-time shopper onboarding */}
            <OnboardingShower />
          </QueryClientProvider>
        </AuthProvider>
      </ToastProvider>
    </SessionProvider>
  );
}

export default MyApp;
