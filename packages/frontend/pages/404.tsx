import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const NotFoundPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-warm-50 to-white">
      <Head><title>Page Not Found – FindA.Sale</title></Head>
      <div className="text-center px-4 max-w-md">
        <h1 className="text-6xl font-bold text-warm-900 mb-4">404</h1>
        <p className="text-xl text-warm-600 mb-8">Page not found</p>
        <p className="text-warm-500 mb-8">
          Sorry, the page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-8 rounded-lg transition-colors mb-8"
        >
          Back to Home
        </Link>

        <div className="border-t border-warm-200 pt-8 mt-8">
          <p className="text-sm text-warm-600 mb-4">Still having trouble?</p>
          <div className="space-y-2">
            <a
              href="mailto:support@finda.sale"
              className="block text-amber-600 hover:text-amber-700 font-medium"
            >
              Contact Support: support@finda.sale
            </a>
            <Link
              href="/contact"
              className="block text-amber-600 hover:text-amber-700 font-medium"
            >
              Send us a message →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
