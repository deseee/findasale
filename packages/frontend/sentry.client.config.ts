import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Replay captures sessions when an error occurs — 0% normally, 100% on error
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  beforeSend(event, hint) {
    const msg = String(hint?.originalException ?? '');
    // Known noise: Sentry SDK internal object lookup failure
    if (msg.includes('Object Not Found Matching Id:')) return null;
    // Known noise: SW registration promise rejects when a page 404s mid-render.
    // next-pwa registers /sw.js without a .catch(); the browser rejects the
    // pending registration when the navigation aborts. Not actionable.
    if (msg === 'Rejected' && event.transaction === '/404') return null;
    if (event.exception?.values?.some((v: any) =>
      v.type === 'UnhandledRejection' &&
      v.value === 'Rejected' &&
      v.stacktrace?.frames?.some((f: any) => f.function === 'ServiceWorkerContainer.register')
    )) return null;
    // Known noise: Next.js router invariant fires when the SW registration
    // rejection causes a second navigation to the same /organizers/[id] URL
    // before the /404 redirect settles. Not actionable — page already 404d.
    if (msg.includes('Invariant: attempted to hard navigate to the same URL')) return null;
    // Known noise: Facebook/Meta in-app browser injects its own instrumentation
    // (app://navigation_performance_logger_android). On beforeunload it can throw
    // "Java object is gone" / "enableDidUserTypeOnKeyboardLogging" as the WebView
    // tears down. Third-party code we don't control — not actionable.
    if (msg.includes('Java object is gone') || msg.includes('enableDidUserTypeOnKeyboardLogging')) return null;
    if (event.exception?.values?.some((v: any) =>
      v.stacktrace?.frames?.some((f: any) =>
        typeof f.filename === 'string' && f.filename.includes('navigation_performance_logger'))
    )) return null;
    return event;
  },
});
