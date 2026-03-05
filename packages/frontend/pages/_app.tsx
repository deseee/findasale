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
// Runs silently on every page. When NextAuth returns a backendJwt (from an
// OAuth sign-in), it passes it to AuthContext.login() then clears the
// NextAuth session — we own the JWT from that point on.
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

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  // QueryClient must be in state so it is stable across renders and SSR
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
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
            {/* PWA helpers — rendered outside Layout so they overlay correctly */}
            <ServiceWorkerUpdateNotifier />
            <PushSubscriber />
            <InstallPrompt />
            {/* Phase 31: OAuth → JWT bridge (must be inside both providers) */}
            <OAuthBridge />
          </QueryClientProvider>
        </AuthProvider>
      </ToastProvider>
    </SessionProvider>
  );
}

export default MyApp;
