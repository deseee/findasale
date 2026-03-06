import React from 'react';
import Link from 'next/link';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console in dev; Sentry is already wired at the Next.js level
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-warm-50 px-4 text-center">
          <div className="max-w-md">
            <div className="text-6xl mb-4">🏚️</div>
            <h1 className="text-2xl font-bold text-warm-800 mb-2">Something went wrong</h1>
            <p className="text-warm-600 mb-6">
              We hit an unexpected error. This has been logged and we'll look into it.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg"
              >
                Try Again
              </button>
              <Link href="/" className="border border-warm-300 text-warm-700 hover:bg-warm-100 font-semibold py-2 px-4 rounded-lg">
                Go Home
              </Link>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-6 text-left bg-red-50 border border-red-200 rounded p-3">
                <summary className="text-red-700 text-sm cursor-pointer font-medium">Error details (dev only)</summary>
                <pre className="text-red-600 text-xs mt-2 whitespace-pre-wrap">{this.state.errorMessage}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
