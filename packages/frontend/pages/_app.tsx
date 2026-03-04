import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { AuthProvider } from '../components/AuthContext';
import { ToastProvider, useToast } from '../components/ToastContext';
import InstallPrompt from '../components/InstallPrompt';

// SW update notifier — renders a dismissible toast when a new service worker is waiting
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

function MyApp({ Component, pageProps }: AppProps) {
  // QueryClient must be in state so it is stable across renders and SSR
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20 * 1000, // 20 seconds — marketplace data changes frequently
            retry: 1,
          },
        },
      })
  );

  return (
    <ToastProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <Layout>
            <Component {...pageProps} />
          </Layout>
          {/* PWA helpers — rendered outside Layout so they overlay correctly */}
          <ServiceWorkerUpdateNotifier />
          <InstallPrompt />
        </QueryClientProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default MyApp;
