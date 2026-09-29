import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Replay captures sessions when an error occurs — 0% normally, 100% on error
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  // Drop errors whose stack frames come from outside FindA.Sale's own code
  // (FINDASALE-NEXTJS-16): adware that injects scripts from tausearch.com, and
  // browser extension scripts. Not actionable.
  denyUrls: [
    /tausearch\.com/i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-(web-)?extension:\/\//i,
  ],
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
    // Known noise: crypto wallet browser extensions (MetaMask/Coinbase Wallet/etc.) inject a
    // page provider and reject a pending promise when the extension's background script
    // disconnects. Confirmed via Sentry event detail (FINDASALE-NEXTJS-J/W, /organizer/dashboard,
    // issues 7564515249 & 7622992307): the raw rejected object is
    // { code: 4900, message: "The provider is disconnected from all chains.",
    //   stack: "...chrome-extension://acmacodkjbdgmoleebolmdjonilkdbch/background.js..." }.
    // Code 4900 is the standard EIP-1193 ProviderRpcError "Disconnected" code, thrown by the
    // extension itself -- FindA.Sale has no wallet/web3 integration. Not actionable.
    const originalException = hint?.originalException as any;
    if (
      originalException &&
      typeof originalException === 'object' &&
      originalException.code === 4900 &&
      typeof originalException.message === 'string' &&
      originalException.message.includes('disconnected from all chains')
    ) return null;
    if (
      originalException &&
      typeof originalException === 'object' &&
      typeof originalException.stack === 'string' &&
      originalException.stack.includes('chrome-extension://')
    ) return null;
    // Known noise: "Cannot redefine property: message"/"...: stack" (FINDASALE-NEXTJS-17,
    // /sales/[id], stack shows XMLHttpRequest.g -> Function.defineProperty). A well-documented
    // Sentry-SDK-vs-browser-extension collision: some extension (antivirus/ad-blocker/etc.)
    // patches XMLHttpRequest and makes a property non-configurable before Sentry's own XHR
    // breadcrumb instrumentation tries to redefine it. No first-party code in this app patches
    // XMLHttpRequest (grepped, zero hits) and no other monitoring SDK is installed alongside
    // Sentry, so this is not something FindA.Sale's own code can trigger or fix. Only 2 events
    // ever, both from one visitor's single session -- not actionable.
    if (msg.includes('Cannot redefine property')) return null;
    return event;
  },
});
