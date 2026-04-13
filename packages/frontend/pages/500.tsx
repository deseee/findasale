import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const ErrorPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800 dark:from-gray-900 dark:to-gray-800">
      <Head><title>Server Error – FindA.Sale</title></Head>
      <div className="text-center px-4">
        <h1 className="text-6xl font-bold text-warm-900 dark:text-warm-100 mb-4">500</h1>
        <p className="text-xl text-warm-600 dark:text-warm-400 mb-8">Server error</p>
        <p className="text-warm-500 dark:text-warm-400 mb-8">
          Something went wrong on our end. We're working to fix it!
        </p>
        <Link
          href="/"
          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
};

export default ErrorPage;
