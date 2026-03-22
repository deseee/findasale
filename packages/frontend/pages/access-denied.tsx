import React from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';

const AccessDenied = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          {/* Icon / visual indicator */}
          <div className="mb-6">
            <svg
              className="w-24 h-24 mx-auto text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4v2m0-10a9 9 0 110 18 9 9 0 010-18z"
              />
            </svg>
          </div>

          {/* Heading */}
          <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-3">
            Access Denied
          </h1>

          {/* Description */}
          <p className="text-lg text-warm-600 dark:text-warm-400 mb-8">
            You don't have permission to access this page. If you think this is a mistake, please contact support.
          </p>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Go to Home
            </Link>
            <Link
              href="/contact"
              className="inline-block text-amber-600 hover:text-amber-700 font-semibold py-3 px-6"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AccessDenied;
