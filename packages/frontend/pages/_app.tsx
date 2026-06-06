import '../styles/globals.css';
// Leaflet base stylesheet — imported globally so it is present in the bundle BEFORE
// the map ever mounts. Previously loaded via an async <link> inside SaleMapInner,
// which race-loaded: Leaflet would init the map before .leaflet-map-pane got its
// CSS, leaving the pane stuck at the identity transform so markers projected
// thousands of px off-screen (H-002 attempt 2). A static import guarantees the CSS
// is applied before _resetView runs.
import 'leaflet/dist/leaflet.css';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
// SSR-skip these — @vercel/analytics 1.6.1 ESM build does `import { useEffect } from "react"`,
// which fails Node's strict ESM loader against react@18 CJS and 500s every SSR page.
// ssr:false defers them to the browser, where React is loaded as a real module.
const Analytics = dynamic(
  () => import('@vercel/analytics/react').then((m) => m.Analytics),
  { ssr: false }
);
const SpeedInsights = dynamic(
  () => import('@vercel/speed-insights/next').then((m) => m.SpeedInsights),
  { ssr: false }
);
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { SessionProvider, useSession, signOut } from 'next-auth/react';
import api from '../lib/api';
import Layout from '../components/Layout';
import { AuthProvider, useAuth } from '../components/AuthContext';
import { ToastProvider, useToast } from '../components/ToastContext';
import { CartProvider } from '../context/CartContext';
import { FeedbackProvider } from '../context/FeedbackContext';
import InstallPrompt from '../components/InstallPrompt';
import FeedbackSurvey from '../components/FeedbackSurvey';
import { usePushSubscription } from '../hooks/usePushSubscription';
import { useTheme } from '../hooks/useTheme'; // #63: Dark Mode
import { useSentryUserContext } from '../hooks/useSentryUserContext'; // Feature #21: User Impact Scoring
import OnboardingModal from '../components/OnboardingModal'; // Phase 27
import PosPaymentRequestAlert from '../components/PosPaymentRequestAlert';
import ErrorBoundary from '../components/ErrorBoundary';
import NudgeBar from '../components/NudgeBar';
import RankUpManager from '../components/RankUpManager';
import { DegradationProvider } from '../contexts/DegradationContext'; // Feature #20: Proactive Degradation Mode
import DegradationBanner from '../components/DegradationBanner'; // Feature #20: Proactive Degradation Mode
import { useDegradationMode } from '../hooks/useDegradationMode'; // Feature #20: Proactive Degradation Mode
import { LowBandwidthProvider } from '../contexts/LowBandwidthContext'; // Feature #22: Low-Bandwidth Mode
import LowBandwidthBanner from '../components/LowBandwidthBanner'; // Feature #22: Low-Bandwidth Mode
import { useLowBandwidthInitializer } from '../hooks/useLowBandwidthInitializer'; // Feature #22: Low-Bandwidth Mode
import { useOfflineSync } from '../hooks/useOfflineSync'; // Feature #69: Local-First Offline Mode
import CookieConsentBanner from '../components/CookieConsentBanner';
import GoogleAnalytics from '../components/GoogleAnalytics';

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

    // next-pwa auto-registration is disabled (register: false in next.config.js).
    // We register manually here so the promise always has a .catch(), preventing
    // unhandled rejections on 404 pages (Sentry FINDASALE-NEXTJS-1, 47 events).
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        // Registration failure is non-fatal — the app works without a service worker.
        console.warn('[SW] registration failed (non-critical):', err);
      });
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [showToast]);

  return null;
}

// Phase 31: Bridge NextAuth OAuth session → our JWT AuthContext.
function OAuthBridge() {
  const { data: session, status } = useSession();
  const { login } = useAuth();
  const router = useRouter();
  const [exchanging, setExchanging] = useState(false);

  useEffect(() => {
    const oauthProfile = (session as any)?.oauthProfile;
    // P1 Security Fix: Removed `!user` guard — previously, an existing JWT session for
    // account A would prevent the OAuth exchange for account B from firing, leaving the
    // user silently stuck on account A's session after completing Google OAuth as account B.
    // The exchange must always run when there is a pending oauthProfile, regardless of
    // whether a prior session is active. The backend sets new cookies that overwrite the
    // existing accessToken/refreshToken, and login() replaces the React auth context.
    if (status === 'authenticated' && oauthProfile && !exchanging) {
      setExchanging(true);
      // POST directly from browser → Next.js proxy (beforeFiles) → Railway
      // This ensures Railway's Set-Cookie headers reach the BROWSER, not Vercel
      // Note: Raw fetch intentionally used here (not api axios instance).
      // The CSRF middleware skips /auth/oauth — see packages/backend/src/middleware/csrf.ts.
      // If the CSRF skip list is ever changed, this call must be updated to include x-csrf-token.
      fetch('/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(oauthProfile),
        credentials: 'include', // Include cookies in request AND store response cookies
      })
        .then(async res => {
          const data = await res.json().catch(() => ({}));
          return { ok: res.ok, status: res.status, data };
        })
        .then(async ({ ok, status, data }) => {
          // Roadmap #422 (Option B): Backend now refuses to silently link a Google
          // identity to an existing email account. Redirect to login with a clear
          // message so the user can sign in with their password, then link from
          // account settings.
          if (status === 409 && data?.code === 'OAUTH_LINK_REQUIRED') {
            signOut({ redirect: false }).finally(() => {
              router.replace(
                `/login?message=${encodeURIComponent(
                  data.message ||
                    'This email is already registered. Please log in first, then link Google from your account settings.'
                )}`
              );
            });
            return;
          }
          if (ok && data?.token) {
            login(data.token);
            // Feature #443: 1-click OAuth claim — attempt claim before redirect
            const claimOrganizerId = typeof window !== 'undefined'
              ? sessionStorage.getItem('claimOrganizerId')
              : null;
            if (claimOrganizerId) {
              sessionStorage.removeItem('claimOrganizerId');
              try {
                await fetch(`/api/organizers/${claimOrganizerId}/claim-oauth`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${data.token}` },
                  credentials: 'include',
                });
              } catch (e) {
                // Non-fatal — user is logged in, claim failed silently
                console.error('[claim-oauth] failed:', e);
              }
              router.replace('/organizer/dashboard?claimed=true');
              signOut({ redirect: false });
              return;
            }
            // Redirect to role-based dashboard after OAuth login
            try {
              const payload = JSON.parse(atob(data.token.split('.')[1]));
              const isOrganizer = payload.roles?.includes('ORGANIZER') || payload.role === 'ORGANIZER';
              const destination = data.returnTo || (isOrganizer ? '/organizer/dashboard' : '/');
              router.replace(destination);
            } catch (_e) {
              // Token decode failed — stay on current page
            }
          }
          // Sign out of NextAuth session (no longer needed)
          signOut({ redirect: false });
        })
        .catch(err => {
          console.error('[OAuthBridge] Browser exchange failed:', err);
          setExchanging(false);
        });
    }
  }, [session, status, exchanging, login, router]);

  return null;
}

/**
 * Phase 27: Show 3-step onboarding modal to new shoppers on first login.
 * Organizers and admins are excluded. Completion stored in localStorage.
 * CRITICAL: Only show on first shopper page (homepage, trending), not on
 * secondary pages like /shopper/wishlist, /shopper/messages, /inspiration.
 */
function OnboardingShower() {
  const { user } = useAuth();
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user || user.roles?.includes('ORGANIZER') || user.roles?.includes('ADMIN')) return;
    if (typeof window === 'undefined') return;

    // Only show on first-time shopper pages (homepage, trending)
    // Do NOT show on secondary pages like /favorites, /messages, /inspiration
    const shopperFirstPages = ['/', '/trending'];
    const isFirstPage = shopperFirstPages.some(p => router.pathname === p);
    if (!isFirstPage) return;

    const done = localStorage.getItem('findasale_onboarded');
    if (!done) setShow(true);
  }, [user, router.pathname]);

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
 *
 * Uses window.location.search (not router.query) because Vercel's edge routing
 * produces a redirectCount=3 chain that strips query params before router.isReady
 * fires. Reading window.location.search on initial mount captures the original URL
 * before any client-side redirect normalises it away.
 * (Fixes #462/#463/#464 — outreach attribution silently broken on Vercel.)
 */
function UTMCapture() {
  // #462/#463/#464 — Three-source UTM capture:
  //
  // Root cause confirmed S836: Chrome incognito strips utm_* params at browser level
  // before the request is sent. Server-side fixes cannot intercept them.
  //
  // Fix: Outreach email links now use fsa_* param names (fsa_src, fsa_med, fsa_cmp,
  // fsa_cnt) which Chrome does not recognise as tracking params and does not strip.
  //
  // Source 1 (primary): fsa_* params in window.location.search (Chrome-safe, email links)
  // Source 2 (legacy): utm_* params in window.location.search (social shares, direct links)
  // Source 3 (fallback): fsa_utm_pending cookie set by middleware.ts (survives redirects)
  //
  // All sources normalise to utm_* names before storing in sessionStorage.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId') ?? undefined;

    // --- Source 1: fsa_* params (Chrome-safe — email outreach links) ---
    let utm_source: string | undefined = urlParams.get('fsa_src') ?? undefined;
    let utm_medium: string | undefined = urlParams.get('fsa_med') ?? undefined;
    let utm_campaign: string | undefined = urlParams.get('fsa_cmp') ?? undefined;
    let utm_content: string | undefined = urlParams.get('fsa_cnt') ?? undefined;
    let ref: string | undefined = urlParams.get('ref') ?? undefined;

    // --- Source 2: utm_* params (social shares / non-incognito direct links) ---
    if (!utm_source && !utm_medium && !utm_campaign && !utm_content) {
      utm_source = urlParams.get('utm_source') ?? undefined;
      utm_medium = urlParams.get('utm_medium') ?? undefined;
      utm_campaign = urlParams.get('utm_campaign') ?? undefined;
      utm_content = urlParams.get('utm_content') ?? undefined;
      if (!ref) ref = urlParams.get('ref') ?? undefined;
    }

    // --- Source 3: Cookie fallback (middleware.ts sets this before any redirect fires) ---
    if (!utm_source && !utm_medium && !utm_campaign && !utm_content) {
      try {
        const cookieMatch = document.cookie
          .split('; ')
          .find(row => row.startsWith('fsa_utm_pending='));
        if (cookieMatch) {
          const raw = decodeURIComponent(cookieMatch.split('=').slice(1).join('='));
          const parsed = JSON.parse(raw);
          utm_source = parsed.utm_source;
          utm_medium = parsed.utm_medium;
          utm_campaign = parsed.utm_campaign;
          utm_content = parsed.utm_content;
          ref = parsed.ref;
          document.cookie = 'fsa_utm_pending=; path=/; max-age=0; SameSite=Lax';
        }
      } catch {
        // Non-fatal
      }
    }

    if (!utm_source && !utm_medium && !utm_campaign && !utm_content) return;

    try {
      sessionStorage.setItem('fsa_utm', JSON.stringify({
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        ref,
        captured_at: new Date().toISOString(),
      }));
    } catch {}

    // Fire pixel only when saleId present (existing behaviour)
    if (!saleId) return;
    const pixelParams = new URLSearchParams();
    pixelParams.append('saleId', saleId);
    if (utm_source) pixelParams.append('utm_source', utm_source);
    if (utm_medium) pixelParams.append('utm_medium', utm_medium);
    if (utm_campaign) pixelParams.append('utm_campaign', utm_campaign);
    if (utm_content) pixelParams.append('utm_content', utm_content);
    fetch(`/api/link-clicks/record?${pixelParams}`, { method: 'GET' }).catch(() => {});
  }, []);

  return null;
}

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error) => {
            // Errors are handled by individual mutation onError callbacks.
            // This global handler prevents unhandled promise rejections from mutateAsync() callers.
            console.error('[MutationCache] unhandled mutation error:', error);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000, // Garbage collect after 5 min to prevent quota exceeded on mobile
            retry: 1,
          },
        },
      })
  );

  // Support per-page layouts via getLayout function
  const getLayout = (Component as any).getLayout || ((page: React.ReactNode) => <Layout>{page}</Layout>);

  // Canonical URL: strip query params, always point to finda.sale (non-www).
  // SEO2: On the statically-generated homepage, router.asPath resolves to the
  // file-system route name "/index" during static generation, which baked
  // https://finda.sale/index into the homepage HTML and conflicted with the
  // page-level canonical (https://finda.sale). Normalise "/index" and "/" so the
  // root always emits the bare origin with no trailing slash. The shared
  // key="canonical" lets Next.js Head collapse this global tag and any page-level
  // canonical into a SINGLE element (the page-level one, rendered later, wins),
  // eliminating duplicate canonical tags site-wide.
  const rawPath = router.asPath.split('?')[0].split('#')[0];
  const normalizedPath = rawPath === '/index' || rawPath === '/' ? '' : rawPath;
  const canonicalUrl = `https://finda.sale${normalizedPath}`;

  return (
    <SessionProvider session={session} basePath="/api/auth">
      <Head>
        <link rel="canonical" href={canonicalUrl} key="canonical" />
      </Head>
      <ToastProvider>
        <AuthProvider>
          <DegradationProvider>
            <LowBandwidthProvider>
              <QueryClientProvider client={queryClient}>
              <ThemeInitializer />
              <CartProvider>
              <FeedbackProvider>
              <ErrorBoundary key={router.asPath}>
                {getLayout(<Component {...pageProps} />)}
              </ErrorBoundary>
              <FeedbackSurvey />
              </FeedbackProvider>
              </CartProvider>
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
              {/* POS: Global fullscreen payment request alert for shoppers */}
              <PosPaymentRequestAlert />
              {/* Explorer's Guild: Rank-up celebration modal */}
              <RankUpManager />
              {/* Cookie Consent Banner */}
              <CookieConsentBanner />
              {/* GA4 — consent-gated, env-var-controlled */}
              <GoogleAnalytics />
              {/* Vercel Analytics + Speed Insights */}
              <Analytics />
              <SpeedInsights />
              </QueryClientProvider>
            </LowBandwidthProvider>
          </DegradationProvider>
        </AuthProvider>
      </ToastProvider>
    </SessionProvider>
  );
}

export default MyApp;
