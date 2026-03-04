/**
 * Offline Page
 *
 * Shown when the app detects the user is offline.
 */

import React from 'react';
import Head from 'next/head';

const OfflinePage = () => {
  return (
    <>
      <Head>
        <title>Offline - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <svg
              className="w-16 h-16 mx-auto text-warm-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071l3.534-3.534a1 1 0 011.414 0l3.534 3.534m-9.172-9.172l3.534-3.534a1 1 0 011.414 0L12 5.757l2.828-2.828a1 1 0 011.414 0l3.534 3.534"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-warm-900 mb-2">You're Offline</h1>
          <p className="text-warm-600 mb-6">
            It looks like you've lost your internet connection. Please check your connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    </>
  );
};

export default OfflinePage;
