import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

// E6: Lightweight error boundary so a Service Worker crash doesn't leave this page broken
class OfflineErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h1>
          <p className="text-gray-600 mb-6">
            The offline page failed to load. Please try refreshing.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function OfflineContent() {
  return (
    <>
      <Head>
        <title>You're offline – FindA.Sale</title>
      </Head>
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <div className="max-w-md">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <svg
              className="w-20 h-20 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 15a4 4 0 004 4h10a4 4 0 001.93-7.46A7 7 0 107.41 7.5 4 4 0 003 11v4z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 12v5m0 0l-2-2m2 2l2-2"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">You're offline</h1>
          <p className="text-gray-600 mb-6">
            It looks like your internet connection is unavailable. Check your connection and try
            again — any pages you've visited before will still load.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Try again
            </button>
            <Link
              href="/"
              className="border border-gray-300 hover:border-gray-400 text-gray-700 font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default function OfflinePage() {
  return (
    <OfflineErrorBoundary>
      <OfflineContent />
    </OfflineErrorBoundary>
  );
}
