import React from 'react';
import Link from 'next/link';

const NotFoundPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-warm-50 to-white">
      <div className="text-center px-4">
        <h1 className="text-6xl font-bold text-warm-900 mb-4">404</h1>
        <p className="text-xl text-warm-600 mb-8">Page not found</p>
        <p className="text-warm-500 mb-8">
          Sorry, the page you're looking for doesn't exist or has been moved.
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

export default NotFoundPage;
